const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { MercadoPagoConfig, Payment, PaymentRefund } = require("mercadopago");
const cors = require("cors")({ origin: true });
const { checkRateLimit, LIMITS } = require("./rateLimiter");

admin.initializeApp();
const db = admin.firestore();

let client;
let payment;

function getPaymentClient() {
    if (!payment) {
        const mpAccessToken = process.env.MP_ACCESS_TOKEN || "";
        if (!mpAccessToken) {
            logger.warn("AVISO: MP_ACCESS_TOKEN não está configurado no ambiente.");
        }
        client = new MercadoPagoConfig({ accessToken: mpAccessToken, options: { timeout: 10000 } });
        payment = new Payment(client);
    }
    return payment;
}

// Envia uma notificação push (FCM) para todos os dispositivos de um usuário.
// Nunca lança erro: falha de notificação não pode comprometer o processamento do pagamento.
async function enviarNotificacaoPush(userId, title, body, link) {
    if (!userId) return;
    try {
        const tokensSnap = await db.collection('fcmTokens').where('userId', '==', userId).get();
        if (tokensSnap.empty) return;

        const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);
        if (tokens.length === 0) return;

        const message = {
            tokens,
            notification: { title, body },
            data: {
                type: 'app',
                link: link || '/profile'
            },
            webpush: {
                notification: { icon: '/apple-touch-icon.png' },
                fcmOptions: { link: link || '/profile' }
            }
        };

        const resp = await admin.messaging().sendEachForMulticast(message);

        // Remove tokens que o FCM reportou como inválidos/expirados (limpeza de base).
        const removals = [];
        resp.responses.forEach((r, idx) => {
            if (!r.success) {
                const code = r.error?.code || '';
                if (
                    code === 'messaging/registration-token-not-registered' ||
                    code === 'messaging/invalid-registration-token' ||
                    code === 'messaging/invalid-argument'
                ) {
                    removals.push(db.collection('fcmTokens').doc(tokens[idx]).delete().catch(() => {}));
                }
            }
        });
        await Promise.all(removals);

        logger.info(`Notificação push enviada para o usuário ${userId}: ${resp.successCount}/${tokens.length} entregues.`);
    } catch (err) {
        logger.error('Erro ao enviar notificação push (ignorado):', err);
    }
}

// Inicia o reembolso total de um pagamento no Mercado Pago (resolução automática de overbooking).
// A reversão de estoque e a remoção das inscrições são feitas pelo próprio webhook quando o
// Mercado Pago confirmar o estorno (status 'refunded'). Nunca lança erro.
async function reembolsarPagamentoAutomatico(paymentId) {
    if (!paymentId) return false;
    try {
        getPaymentClient(); // garante que o client do Mercado Pago esteja inicializado
        const refundClient = new PaymentRefund(client);
        await refundClient.create({
            payment_id: Number(paymentId),
            requestOptions: { idempotencyKey: `refund-overbooking-${paymentId}` }
        });
        logger.info(`Reembolso automático (overbooking) iniciado para o pagamento ${paymentId}.`);
        return true;
    } catch (e) {
        logger.error(`Falha ao reembolsar automaticamente o pagamento ${paymentId}:`, e);
        return false;
    }
}

exports.criarCobrancaPix = onCall({ cors: true }, async (request) => {
    const data = request.data;
    const { valor, cpf, email, pedidoId, deviceId } = data;
    
    logger.info("Criando cobrança Pix. Pedido:", pedidoId, "Valor:", valor, "CPF:", cpf, "Email:", email, "DeviceID:", deviceId);
    
    if (!valor || !email || !pedidoId) {
        throw new HttpsError('invalid-argument', 'Dados incompletos para gerar o Pix.');
    }

    // Rate Limiting: identifica o chamador por uid; sem login, usa deviceId/IP para não
    // colocar todos os anônimos no mesmo balde (um comprador legítimo bloquearia os demais).
    const clientIp = request.rawRequest?.headers?.['x-forwarded-for'] || request.rawRequest?.ip || '';
    const rateLimitKey = request.auth?.uid || data.deviceId || clientIp || data.userId || 'anonymous';
    // Rate Limiting: 5 cobranças por minuto
    const rlMinuto = await checkRateLimit(rateLimitKey, 'criarCobrancaPix', LIMITS.CRIAR_COBRANCA.max, LIMITS.CRIAR_COBRANCA.windowSec);
    if (!rlMinuto.allowed) {
        throw new HttpsError('resource-exhausted', `Limite de cobranças atingido. Tente novamente em ${Math.ceil(rlMinuto.retryAfterMs / 1000)} segundos.`);
    }
    // Rate Limiting: 20 cobranças por hora
    const rlHora = await checkRateLimit(rateLimitKey, 'criarCobrancaPix_hora', LIMITS.CRIAR_COBRANCA_HORA.max, LIMITS.CRIAR_COBRANCA_HORA.windowSec);
    if (!rlHora.allowed) {
        throw new HttpsError('resource-exhausted', `Limite de cobranças por hora atingido. Tente novamente em ${Math.ceil(rlHora.retryAfterMs / 1000)} segundos.`);
    }

    const eventId = data.eventId || "ingresso";
    const itensSelecionados = data.itensSelecionados || [];

    try {
        // Validação preventiva de estoque antes de gerar a cobrança Pix
        const eventRef = db.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();
        if (!eventDoc.exists) {
            throw new HttpsError('not-found', 'Evento correspondente não foi encontrado.');
        }
        const eventData = eventDoc.data();
        if (eventData.tickets && itensSelecionados.length > 0) {
            const tickets = eventData.tickets || [];
            for (const item of itensSelecionados) {
                const ticketOriginal = tickets.find(t => t.id === item.id);
                if (ticketOriginal) {
                    const available = ticketOriginal.capacity - (ticketOriginal.sold || 0);
                    if (Number(item.quantity) > available) {
                        throw new HttpsError('failed-precondition', `Desculpe, o ingresso "${ticketOriginal.name}" esgotou ou não possui a quantidade solicitada disponível.`);
                    }
                }
            }
        }

        // Chave de idempotência estável por pedido: garante que retries da mesma compra
        // não gerem cobranças duplicadas no Mercado Pago.
        const idempotencyKey = pedidoId;

        // Extrai e formata o nome do comprador
        const clienteNome = data.clienteNome || "Comprador Ficticio";
        const nameParts = clienteNome.trim().split(/\s+/);
        const firstName = nameParts[0] || "Comprador";
        const lastName = nameParts.slice(1).join(" ") || "Atchêi";

        // Extrai e formata o telefone
        const clienteTelefone = data.clienteTelefone || "11999999999";
        const cleanPhone = clienteTelefone.replace(/\D/g, "");
        let areaCode = "11";
        let phoneNumber = "999999999";
        if (cleanPhone.length >= 10) {
            areaCode = cleanPhone.substring(0, 2);
            phoneNumber = cleanPhone.substring(2);
        } else if (cleanPhone.length > 0) {
            phoneNumber = cleanPhone;
        }

        const cleanCpf = (cpf || "").replace(/\D/g, "") || "00000000000";
        const docType = cleanCpf.length === 14 ? 'CNPJ' : 'CPF';

        // Dados opcionais de endereço de cobrança enviados pelo frontend, com fallback padrão
        const payerAddress = data.payerAddress || {};
        const zipCode = (payerAddress.zipCode || '01001000').replace(/\D/g, "") || '01001000';
        const streetName = payerAddress.streetName || 'Praca da Se';
        const streetNumber = payerAddress.streetNumber ? Number(payerAddress.streetNumber) : 1;
        const neighborhood = payerAddress.neighborhood || 'Se';
        const city = payerAddress.city || 'Sao Paulo';
        const federalUnit = payerAddress.federalUnit || 'SP';

        const eventTitle = data.eventTitle || "Ingresso Atchêi";
        const eventDescription = data.eventDescription || `Ingresso para o evento ID ${eventId}`;

        // Gerar statement_descriptor dinâmico e seguro de no máximo 13 caracteres alfanuméricos
        const cleanTitleForDescriptor = eventTitle
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Remove acentos
            .replace(/[^a-zA-Z0-9\s]/g, "")  // Remove caracteres especiais exceto espaços
            .replace(/\s+/g, "")             // Remove espaços
            .toUpperCase();
        const statementDescriptor = `ATCHEI*${cleanTitleForDescriptor}`.substring(0, 13);

        logger.info("Statement Descriptor gerado:", statementDescriptor, "Comprimento:", statementDescriptor.length);

        // Processar múltiplos ingressos (VIP, Camarote, etc.) e lotes selecionados.
        // SEGURANÇA: o preço é SEMPRE obtido do documento do evento no servidor.
        // O preço enviado pelo cliente é ignorado para impedir fraude de valor.
        const ticketsDoEvento = eventData.tickets || [];
        let valorTotal = Number(valor);
        let itemsMP = [];

        if (itensSelecionados.length > 0) {
            let somaValores = 0;
            for (const item of itensSelecionados) {
                const qty = Number(item.quantity) || 0;
                if (qty <= 0) continue;

                const ticketReal = ticketsDoEvento.find(t => t.id === item.id);
                if (!ticketReal) {
                    throw new HttpsError('failed-precondition', `O ingresso "${item.name || item.id}" não está disponível neste evento.`);
                }
                const price = Number(ticketReal.price) || 0;
                somaValores += price * qty;

                itemsMP.push({
                    id: ticketReal.id,
                    title: (ticketReal.name || "Ingresso").substring(0, 30),
                    description: `Ingresso do lote ${ticketReal.name}`.substring(0, 60),
                    category_id: 'tickets',
                    quantity: qty,
                    unit_price: price
                });
            }
            if (somaValores <= 0) {
                throw new HttpsError('invalid-argument', 'Nenhum ingresso válido foi selecionado.');
            }
            valorTotal = somaValores;
        } else {
            // Fallback de lote único: usa o preço PIX configurado no evento, não o valor do cliente.
            // pixTicketPrice é string (ex.: "50" ou "R$ 50,00"); extrai o número de forma robusta.
            const precoEventoStr = String(eventData.pixTicketPrice ?? '').replace(/[^\d.,]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
            const precoEvento = Number(precoEventoStr);
            if (precoEvento > 0) {
                valorTotal = precoEvento;
            }
            itemsMP.push({
                id: eventId,
                title: eventTitle.substring(0, 30),
                description: eventDescription.substring(0, 60),
                category_id: 'tickets',
                quantity: 1,
                unit_price: valorTotal
            });
        }

        const body = {
            transaction_amount: valorTotal,
            description: `Ingresso Atchêi - Pedido ${pedidoId}`.substring(0, 60),
            payment_method_id: 'pix',
            external_reference: pedidoId,
            statement_descriptor: statementDescriptor,
            payer: {
                email: email,
                first_name: firstName,
                last_name: lastName,
                phone: {
                    area_code: areaCode,
                    number: phoneNumber
                },
                identification: {
                    type: docType,
                    number: cleanCpf
                },
                address: {
                    zip_code: zipCode,
                    street_name: streetName,
                    street_number: streetNumber,
                    neighborhood: neighborhood,
                    city: city,
                    federal_unit: federalUnit
                }
            },
            additional_info: {
                items: itemsMP,
                payer: {
                    first_name: firstName,
                    last_name: lastName,
                    phone: {
                        area_code: areaCode,
                        number: phoneNumber
                    },
                    address: {
                        zip_code: zipCode,
                        street_name: streetName,
                        street_number: streetNumber
                    },
                    registration_date: new Date().toISOString()
                }
            },
            metadata: {
                pedido_id: pedidoId,
                event_id: eventId,
                user_id: data.userId || ''
            },
            notification_url: 'https://webhookmercadopago-dfjumiogoq-uc.a.run.app'
        };

        const requestOptions = {
            idempotencyKey
        };

        if (deviceId) {
            requestOptions.meliSessionId = deviceId;
        }

        // Evita rebaixar um pedido já processado: se o mesmo pedidoId for reusado após o pagamento,
        // o set merge abaixo sobrescreveria status='pago' por 'pendente'. Bloqueia antes de gerar o Pix.
        const pedidoExistenteSnap = await db.collection('pedidos').doc(pedidoId).get();
        if (pedidoExistenteSnap.exists && ['pago', 'estornado', 'chargeback', 'cancelado'].includes(pedidoExistenteSnap.data().status)) {
            throw new HttpsError('failed-precondition', 'Este pedido já foi processado.');
        }

        const mpResponse = await getPaymentClient().create({
            body,
            requestOptions
        });

        await db.collection('pedidos').doc(pedidoId).set({
            id: pedidoId,
            valor: valorTotal,
            clienteEmail: email,
            clienteNome: clienteNome,
            clienteTelefone: clienteTelefone,
            clienteCpf: cleanCpf,
            eventId: eventId,
            eventTitle: eventTitle, // Guarda o título para usar no texto da notificação push (sem leitura extra)
            userId: data.userId || '',
            status: 'pendente',
            itensComprados: itensSelecionados, // Grava os ingressos do lote para atualizar estoque na aprovação
            mercadoPagoPaymentId: mpResponse.id,
            dataCriacao: FieldValue.serverTimestamp(),
        }, { merge: true });

        return {
            id: mpResponse.id,
            qr_code: mpResponse.point_of_interaction?.transaction_data?.qr_code,
            qr_code_base64: mpResponse.point_of_interaction?.transaction_data?.qr_code_base64
        };

    } catch (error) {
        if (error instanceof HttpsError) {
            throw error;
        }
        logger.error("Erro ao criar cobrança Pix:", error);
        throw new HttpsError('internal', 'Erro ao processar pagamento Pix.');
    }
});

exports.webhookMercadoPago = onRequest(async (req, res) => {
    cors(req, res, async () => {
        // Rate Limiting: 60 requests por minuto por IP
        const clientIp = req.headers['x-forwarded-for'] || req.ip || 'unknown';
        const rlWebhook = await checkRateLimit(clientIp, 'webhookMercadoPago', LIMITS.WEBHOOK.max, LIMITS.WEBHOOK.windowSec);
        if (!rlWebhook.allowed) {
            const retryAfterSec = Math.ceil(rlWebhook.retryAfterMs / 1000);
            res.set('Retry-After', String(retryAfterSec));
            res.status(429).send(`Rate limit excedido. Tente novamente em ${retryAfterSec} segundos.`);
            return;
        }

        const paymentId = req.query.id || req.body?.data?.id || req.body?.id;
        logger.info("Webhook payload recebido. Query:", req.query, "Body:", req.body, "Parsed ID:", paymentId);

        if (!paymentId) {
            res.status(400).send('ID do pagamento não fornecido.');
            return;
        }

        const signatureHeader = req.headers['x-signature'] || req.headers['X-Signature'] || '';
        const requestIdHeader = req.headers['x-request-id'] || req.headers['X-Request-Id'] || '';
        
        // Obter o segredo do Webhook das variáveis de ambiente do Firebase Functions
        const webhookSecret = process.env.MP_WEBHOOK_SECRET;
        
        if (webhookSecret) {
            if (!signatureHeader || !requestIdHeader) {
                logger.error("Validação de assinatura falhou: Cabeçalhos x-signature ou x-request-id ausentes.");
                res.status(400).send('Assinatura ausente ou inválida.');
                return;
            }
            try {
                // O cabeçalho x-signature vem no formato: ts=NUMERO,v1=HASH
                const parts = signatureHeader.split(',');
                let ts = '';
                let hashReceived = '';
                for (const part of parts) {
                    const [key, val] = part.split('=');
                    if (key === 'ts') ts = val;
                    if (key === 'v1') hashReceived = val;
                }
                
                if (!ts || !hashReceived) {
                    logger.warn("Webhook recebido com formato de x-signature inválido.");
                    res.status(400).send('Assinatura inválida.');
                    return;
                }
                
                // Formato do manifest exigido pelo Mercado Pago para validação:
                // id:[ID_DO_RECURSO];request-id:[X-REQUEST-ID];ts:[TIMESTAMP_DO_CABECALHO];
                const crypto = require('crypto');
                const manifest = `id:${paymentId};request-id:${requestIdHeader};ts:${ts};`;
                
                // Gerar HMAC SHA256 usando o segredo configurado e o manifest
                const hmac = crypto.createHmac('sha256', webhookSecret);
                hmac.update(manifest);
                const hashCalculated = hmac.digest('hex');
                
                // Comparar hashes de forma segura (timing-safe) para evitar timing attacks
                const sigValida =
                    hashCalculated.length === hashReceived.length &&
                    crypto.timingSafeEqual(Buffer.from(hashCalculated), Buffer.from(hashReceived));
                if (!sigValida) {
                    logger.error("Assinatura do webhook inválida. Acesso não autorizado.");
                    res.status(401).send('Assinatura não autorizada.');
                    return;
                }
                logger.info("Assinatura do webhook do Mercado Pago validada com sucesso!");
            } catch (sigError) {
                logger.error("Erro ao processar assinatura do webhook:", sigError);
                res.status(500).send('Erro interno na validação de assinatura.');
                return;
            }
        } else if (process.env.FUNCTIONS_EMULATOR === 'true') {
            logger.warn("MP_WEBHOOK_SECRET ausente — validação de assinatura ignorada (apenas no emulador).");
        } else {
            // Fail-closed: em produção, sem segredo configurado o webhook é rejeitado por segurança.
            logger.error("MP_WEBHOOK_SECRET não configurado em produção. Rejeitando webhook.");
            res.status(500).send('Configuração de segurança ausente.');
            return;
        }

        try {
            const mpPaymentInfo = await getPaymentClient().get({ id: paymentId });
            const statusReal = mpPaymentInfo.status;
            
            const pedidosRef = db.collection('pedidos');
            let pedidoDoc = null;
            let dadosPedido = null;

            // Busca direta por external_reference (pedidoId)
            if (mpPaymentInfo.external_reference) {
                const docSnap = await pedidosRef.doc(mpPaymentInfo.external_reference).get();
                if (docSnap.exists) {
                    pedidoDoc = docSnap;
                    dadosPedido = docSnap.data();
                }
            }

            // Fallback por mercadoPagoPaymentId se não achou por external_reference
            if (!dadosPedido) {
                const querySnapshot = await pedidosRef.where('mercadoPagoPaymentId', '==', Number(paymentId)).limit(1).get();
                if (!querySnapshot.empty) {
                    pedidoDoc = querySnapshot.docs[0];
                    dadosPedido = pedidoDoc.data();
                }
            }

            if (!dadosPedido) {
                logger.error(`Pedido correspondente ao pagamento MP ID ${paymentId} não encontrado no Firestore.`);
                res.status(404).send('Pedido não encontrado.');
                return;
            }
            
            let isOverbooked = false;
            let statusPedidoAtual = '';
            // Sinaliza que a compra acabou de ser confirmada AGORA (transição pendente -> pago),
            // para disparar a notificação push apenas uma vez, ignorando webhooks redundantes.
            let deveNotificar = false;

            if (statusReal === 'approved') {
                // Toda a operação de aprovação ocorre de forma atômica dentro de uma transação
                try {
                    await db.runTransaction(async (transaction) => {
                        // Reinicia as flags a cada tentativa: o Firestore pode reexecutar este callback
                        // em caso de contenção (retry), e um valor true de uma tentativa abortada não pode
                        // vazar para a próxima (evita overbooking/notificação falsos após recomputar leituras).
                        isOverbooked = false;
                        deveNotificar = false;

                        const pedidoRef = pedidosRef.doc(pedidoDoc.id);
                        const currentPedidoDoc = await transaction.get(pedidoRef);

                        if (!currentPedidoDoc.exists) {
                            throw new Error("Pedido não encontrado na transação.");
                        }

                        const currentPedidoData = currentPedidoDoc.data();
                        statusPedidoAtual = currentPedidoData.status;

                        // Se o pedido já está em qualquer estado terminal, aborta para evitar que um
                        // 'approved' tardio/retry do Mercado Pago ressuscite um pedido pago/estornado/cancelado
                        // (reprocessamento recriaria inscrições determinísticas e corromperia o estoque).
                        if (['pago', 'estornado', 'chargeback', 'cancelado'].includes(statusPedidoAtual)) {
                            logger.info(`Pedido ${pedidoDoc.id} já está em estado terminal (${statusPedidoAtual}). Abortando aprovação redundante/tardia.`);
                            return;
                        }

                        // Transição efetiva para pago: libera o envio da notificação push após a transação
                        deveNotificar = true;

                        // 1. Atualizar o pedido para Pago
                        transaction.update(pedidoRef, {
                            status: 'pago',
                            dataPagamento: FieldValue.serverTimestamp()
                        });
                        
                        const itensComprados = currentPedidoData.itensComprados || [];
                        
                        // 2. Decrementar estoque dos ingressos correspondentes no evento
                        if (currentPedidoData.eventId && itensComprados.length > 0) {
                            const eventRef = db.collection('events').doc(currentPedidoData.eventId);
                            const eventDoc = await transaction.get(eventRef);
                            
                            if (eventDoc.exists) {
                                const eventData = eventDoc.data();
                                const tickets = eventData.tickets || [];
                                
                                // Mapear as compras de cada ticketId neste pedido
                                const vendasMap = {};
                                for (const item of itensComprados) {
                                    vendasMap[item.id] = (vendasMap[item.id] || 0) + (Number(item.quantity) || 0);
                                }
                                
                                let alterado = false;
                                const updatedTickets = tickets.map(ticket => {
                                    const qtdVendida = vendasMap[ticket.id];
                                    if (qtdVendida) {
                                        alterado = true;
                                        const novoSold = (ticket.sold || 0) + qtdVendida;
                                        if (novoSold > ticket.capacity) {
                                            isOverbooked = true; // Houve estouro de estoque (venda simultânea)
                                        }
                                        const novoStatus = novoSold >= ticket.capacity ? 'sold_out' : ticket.status;
                                        return {
                                            ...ticket,
                                            sold: novoSold,
                                            status: novoStatus
                                        };
                                    }
                                    return ticket;
                                });
                                
                                if (alterado) {
                                    transaction.update(eventRef, { tickets: updatedTickets });
                                    logger.info(`Estoque atualizado no evento ${currentPedidoData.eventId} para os tickets:`, Object.keys(vendasMap));
                                }
                            }
                        }
                        
                        if (isOverbooked) {
                            transaction.update(pedidoRef, { overbooked: true });
                            logger.warn(`Alerta de Overbooking detectado no pedido ${pedidoDoc.id}`);
                        }
                        
                        // 3. Criar inscrições na coleção registrations
                        // O ID da inscrição agora é 100% determinístico e idempotente (usa o id do pedido e o índice), eliminando duplicações
                        if (itensComprados.length > 0) {
                            for (const item of itensComprados) {
                                const qty = Number(item.quantity) || 0;
                                for (let q = 0; q < qty; q++) {
                                    const registrationId = `reg_${currentPedidoData.eventId}_${currentPedidoData.userId}_${item.id}_${q}_${pedidoDoc.id}`;
                                    const regRef = db.collection('registrations').doc(registrationId);
                                    transaction.set(regRef, {
                                        id: registrationId,
                                        eventId: currentPedidoData.eventId || '',
                                        userId: currentPedidoData.userId || '',
                                        userName: currentPedidoData.clienteNome || '',
                                        userEmail: currentPedidoData.clienteEmail || '',
                                        userPhone: currentPedidoData.clienteTelefone || '',
                                        userCpf: currentPedidoData.clienteCpf || '',
                                        paymentStatus: isOverbooked ? 'Overbooking (Pago)' : 'Pago',
                                        overbooked: isOverbooked,
                                        ticketTypeId: item.id,
                                        ticketTypeName: item.name,
                                        pedidoId: pedidoDoc.id,
                                        timestamp: new Date().toISOString()
                                    });
                                }
                            }
                            logger.info(`Transação: Pedido ${pedidoDoc.id} processado! Inscrições criadas.`);
                        } else {
                            const registrationId = `reg_${currentPedidoData.eventId}_${currentPedidoData.userId}_${pedidoDoc.id}`;
                            const regRef = db.collection('registrations').doc(registrationId);
                            transaction.set(regRef, {
                                id: registrationId,
                                eventId: currentPedidoData.eventId || '',
                                userId: currentPedidoData.userId || '',
                                userName: currentPedidoData.clienteNome || '',
                                userEmail: currentPedidoData.clienteEmail || '',
                                userPhone: currentPedidoData.clienteTelefone || '',
                                userCpf: currentPedidoData.clienteCpf || '',
                                paymentStatus: isOverbooked ? 'Overbooking (Pago)' : 'Pago',
                                overbooked: isOverbooked,
                                pedidoId: pedidoDoc.id,
                                timestamp: new Date().toISOString()
                            });
                            logger.info(`Transação: Pedido ${pedidoDoc.id} processado! Inscrição simples criada.`);
                        }
                    });
                } catch (transError) {
                    logger.error("Erro na transação de aprovação do pedido:", transError);
                    res.status(500).send('Erro na transação do banco.');
                    return;
                }
            }

            // Tratamento de estorno, chargeback e cancelamento.
            // Se o pedido já havia sido pago, devolvemos o estoque ao evento e removemos as
            // inscrições geradas, impedindo que um ingresso estornado continue válido na portaria.
            const REFUND_STATUSES = ['refunded', 'cancelled', 'charged_back'];
            if (REFUND_STATUSES.includes(statusReal)) {
                try {
                    await db.runTransaction(async (transaction) => {
                        const pedidoRef = pedidosRef.doc(pedidoDoc.id);

                        // IMPORTANTE: todas as leituras devem ocorrer antes de qualquer escrita na transação.
                        const currentPedidoDoc = await transaction.get(pedidoRef);
                        if (!currentPedidoDoc.exists) {
                            throw new Error("Pedido não encontrado na transação de estorno.");
                        }
                        const currentPedidoData = currentPedidoDoc.data();
                        const statusAtual = currentPedidoData.status;

                        const novoStatusPedido = statusReal === 'charged_back'
                            ? 'chargeback'
                            : (statusReal === 'refunded' ? 'estornado' : 'cancelado');

                        // Idempotência: se já está em um estado final de estorno, não faz nada.
                        if (['estornado', 'chargeback', 'cancelado'].includes(statusAtual)) {
                            logger.info(`Pedido ${pedidoDoc.id} já está em estado final (${statusAtual}). Ignorando estorno redundante.`);
                            return;
                        }

                        // Só revertemos estoque/inscrições se o pedido chegou a ser efetivamente pago.
                        const eraPago = statusAtual === 'pago';
                        const itensComprados = currentPedidoData.itensComprados || [];

                        // Leitura do evento (antes das escritas) apenas quando há estoque a devolver.
                        let eventDoc = null;
                        let eventRef = null;
                        if (eraPago && currentPedidoData.eventId && itensComprados.length > 0) {
                            eventRef = db.collection('events').doc(currentPedidoData.eventId);
                            eventDoc = await transaction.get(eventRef);
                        }

                        // 1. Atualiza o status do pedido
                        transaction.update(pedidoRef, {
                            status: novoStatusPedido,
                            dataEstorno: FieldValue.serverTimestamp()
                        });

                        if (!eraPago) {
                            // Pedido nunca foi pago (ex.: Pix expirado). Nada de estoque/inscrições a reverter.
                            logger.info(`Pedido ${pedidoDoc.id} marcado como ${novoStatusPedido} (não havia sido pago).`);
                            return;
                        }

                        // 2. Devolve o estoque dos lotes ao evento
                        if (eventDoc && eventDoc.exists) {
                            const eventData = eventDoc.data();
                            const tickets = eventData.tickets || [];
                            const devolucoesMap = {};
                            for (const item of itensComprados) {
                                devolucoesMap[item.id] = (devolucoesMap[item.id] || 0) + (Number(item.quantity) || 0);
                            }
                            let alterado = false;
                            const updatedTickets = tickets.map(ticket => {
                                const qtdDevolvida = devolucoesMap[ticket.id];
                                if (qtdDevolvida) {
                                    alterado = true;
                                    const novoSold = Math.max(0, (ticket.sold || 0) - qtdDevolvida);
                                    // Reabre o lote se estava esgotado e voltou a ter vaga
                                    const novoStatus = ticket.status === 'sold_out' && novoSold < ticket.capacity
                                        ? 'active'
                                        : ticket.status;
                                    return { ...ticket, sold: novoSold, status: novoStatus };
                                }
                                return ticket;
                            });
                            if (alterado) {
                                transaction.update(eventRef, { tickets: updatedTickets });
                                logger.info(`Estoque devolvido no evento ${currentPedidoData.eventId} após ${novoStatusPedido} do pedido ${pedidoDoc.id}.`);
                            }
                        }

                        // 3. Remove as inscrições criadas por este pedido (IDs determinísticos,
                        // idênticos aos gerados na aprovação). O contador é ajustado por onRegistrationDeleted.
                        if (itensComprados.length > 0) {
                            for (const item of itensComprados) {
                                const qty = Number(item.quantity) || 0;
                                for (let q = 0; q < qty; q++) {
                                    const registrationId = `reg_${currentPedidoData.eventId}_${currentPedidoData.userId}_${item.id}_${q}_${pedidoDoc.id}`;
                                    transaction.delete(db.collection('registrations').doc(registrationId));
                                }
                            }
                        } else {
                            const registrationId = `reg_${currentPedidoData.eventId}_${currentPedidoData.userId}_${pedidoDoc.id}`;
                            transaction.delete(db.collection('registrations').doc(registrationId));
                        }
                        logger.info(`Inscrições do pedido ${pedidoDoc.id} removidas após ${novoStatusPedido}.`);
                    });
                } catch (transError) {
                    logger.error("Erro na transação de estorno/cancelamento do pedido:", transError);
                    res.status(500).send('Erro na transação de estorno.');
                    return;
                }
            }

            // Pós-pagamento (apenas na transição efetiva para pago). Executado após a transação
            // para não atrasar nem arriscar o processamento financeiro.
            if (deveNotificar) {
                const tituloEvento = dadosPedido.eventTitle || 'o evento';
                if (isOverbooked) {
                    // Resolução automática de overbooking: reembolsa o pagamento. O webhook de
                    // estorno (status 'refunded') cuidará de devolver o estoque e remover as inscrições.
                    // POLÍTICA: se QUALQUER lote do pedido estourou a capacidade, o pedido INTEIRO é
                    // reembolsado (refund total), inclusive lotes do mesmo pedido que tinham estoque.
                    // É a opção simples e consistente; refund parcial por lote exigiria cálculo de valor
                    // por item e ajuste do webhook de 'refunded' para não remover todas as inscrições.
                    const reembolsado = await reembolsarPagamentoAutomatico(paymentId);
                    if (reembolsado) {
                        await enviarNotificacaoPush(
                            dadosPedido.userId,
                            'Lote esgotado — reembolso em andamento',
                            `O lote de "${tituloEvento}" esgotou antes da confirmação. Seu pagamento está sendo reembolsado automaticamente.`,
                            '/profile'
                        );
                    } else {
                        await enviarNotificacaoPush(
                            dadosPedido.userId,
                            'Problema com seu ingresso',
                            `Houve um problema de disponibilidade em "${tituloEvento}". Entre em contato com o organizador.`,
                            '/profile'
                        );
                    }
                } else {
                    await enviarNotificacaoPush(
                        dadosPedido.userId,
                        'Ingresso confirmado! 🎟️',
                        `Seu ingresso para ${tituloEvento} foi confirmado. Toque para visualizar.`,
                        dadosPedido.eventId ? `/event/${dadosPedido.eventId}` : '/profile'
                    );
                }
            }

            res.status(200).send('Webhook processado.');

        } catch (error) {
            logger.error('Erro ao processar webhook:', error);
            res.status(500).send('Erro interno do servidor.');
        }
    });
});

exports.adminResetPassword = onCall({ cors: true }, async (request) => {
    const data = request.data;
    const { uid, newPassword } = data;
    
    // 1. Verificar se quem está chamando está autenticado
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Apenas usuários autenticados podem redefinir senhas.');
    }
    
    // 2. Verificar se o solicitante é um dos administradores permitidos (via claims de admin ou fallback de e-mail)
    const callerEmail = request.auth.token.email || '';
    const adminEmails = [
      'admin@atche.com.br',
      'theotheteo@gmail.com',
      'allanjipa123@gmail.com'
    ];
    
    // ATENÇÃO: O fallback por e-mail deve ser mantido temporariamente até a migração completa
    const isCallerAdmin = request.auth.token.admin === true || 
                          adminEmails.includes(callerEmail.toLowerCase());
                          
    if (!isCallerAdmin) {
        throw new HttpsError('permission-denied', 'Apenas administradores podem redefinir senhas de parceiros.');
    }
    
    if (!uid || !newPassword) {
        throw new HttpsError('invalid-argument', 'UID e nova senha são obrigatórios.');
    }

    // Rate Limiting: 3 resets por 5 minutos por admin
    const rlAdmin = await checkRateLimit(request.auth.uid, 'adminResetPassword', LIMITS.ADMIN_RESET.max, LIMITS.ADMIN_RESET.windowSec);
    if (!rlAdmin.allowed) {
        throw new HttpsError('resource-exhausted', `Limite de resets atingido. Tente novamente em ${Math.ceil(rlAdmin.retryAfterMs / 1000)} segundos.`);
    }
    
    try {
        // 3. Atualizar a senha no Firebase Authentication
        await admin.auth().updateUser(uid, {
            password: newPassword
        });
        
        // 4. Atualizar o perfil no Firestore para exigir mudança no próximo login
        await db.collection('profiles').doc(uid).update({
            mustChangePassword: true
        });
        
        logger.info(`Senha do usuário ${uid} redefinida com sucesso pelo admin ${callerEmail}.`);
        return { success: true };
    } catch (error) {
        logger.error(`Erro ao redefinir senha do usuário ${uid}:`, error);
        throw new HttpsError('internal', 'Erro interno ao redefinir senha.');
    }
});

// Nova Cloud Function para definir claims de administrador nos usuários
exports.setAdminClaim = onCall({ cors: true }, async (request) => {
    // 1. Verificar se quem está chamando está autenticado
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Apenas usuários autenticados podem definir permissões.');
    }
    
    // 2. Verificar se o solicitante é um dos administradores permitidos (claims de admin ou e-mail de fallback)
    const callerEmail = request.auth.token.email || '';
    const adminEmails = [
      'admin@atche.com.br',
      'theotheteo@gmail.com',
      'allanjipa123@gmail.com'
    ];
    
    const isCallerAdmin = request.auth.token.admin === true || 
                          adminEmails.includes(callerEmail.toLowerCase());
                          
    if (!isCallerAdmin) {
        throw new HttpsError('permission-denied', 'Apenas administradores podem definir novos administradores.');
    }
    
    const { uid, admin: shouldBeAdmin } = request.data;
    if (!uid) {
        throw new HttpsError('invalid-argument', 'O UID do usuário alvo é obrigatório.');
    }
    
    try {
        // 3. Definir claim de admin no Firebase Authentication
        await admin.auth().setCustomClaims(uid, { admin: shouldBeAdmin === true });
        logger.info(`Claim admin definido como ${shouldBeAdmin === true} para o usuário ${uid} por ${callerEmail}.`);
        return { success: true, uid, admin: shouldBeAdmin === true };
    } catch (error) {
        logger.error(`Erro ao definir claim admin para o usuário ${uid}:`, error);
        throw new HttpsError('internal', 'Erro interno ao definir permissão de administrador.');
    }
});

// Gera um "pagamento Pix confirmado" de teste, produzindo um ingresso real e validável,
// sem cobrar nada nem alterar estoque/faturamento do evento. Exclusivo para administradores.
// Idempotente por (evento, admin): regerar substitui o ingresso de teste anterior em vez de acumular.
exports.criarIngressoTeste = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Apenas usuários autenticados podem gerar ingressos de teste.');
    }

    const callerEmail = request.auth.token.email || '';
    const adminEmails = [
        'admin@atche.com.br',
        'theotheteo@gmail.com',
        'allanjipa123@gmail.com'
    ];
    const isCallerAdmin = request.auth.token.admin === true ||
                          adminEmails.includes(callerEmail.toLowerCase());
    if (!isCallerAdmin) {
        throw new HttpsError('permission-denied', 'Apenas administradores podem gerar ingressos de teste.');
    }

    const { eventId, itensSelecionados } = request.data || {};
    if (!eventId) {
        throw new HttpsError('invalid-argument', 'O eventId é obrigatório.');
    }

    const uid = request.auth.uid;
    const itens = Array.isArray(itensSelecionados) ? itensSelecionados : [];

    try {
        const eventRef = db.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();
        if (!eventDoc.exists) {
            throw new HttpsError('not-found', 'Evento não encontrado.');
        }
        const eventData = eventDoc.data();
        const ticketsEvento = eventData.tickets || [];

        // Valor e itens calculados no servidor (a partir dos lotes do evento). NÃO altera o estoque.
        let valorTotal = 0;
        const itensComprados = [];
        if (itens.length > 0) {
            for (const item of itens) {
                const qty = Number(item.quantity) || 0;
                if (qty <= 0) continue;
                const ticketReal = ticketsEvento.find(t => t.id === item.id);
                const price = ticketReal ? (Number(ticketReal.price) || 0) : 0;
                const name = ticketReal ? ticketReal.name : (item.name || 'Ingresso');
                valorTotal += price * qty;
                itensComprados.push({ id: item.id, name, quantity: qty });
            }
        } else {
            const precoStr = String(eventData.pixTicketPrice ?? '')
                .replace(/[^\d.,]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
            valorTotal = Number(precoStr) || 0;
        }

        const callerName = request.auth.token.name || callerEmail || 'Administrador (Teste)';
        // ID determinístico por (evento, admin): regerar sobrescreve o teste anterior.
        const pedidoId = `TESTE-${eventId}-${uid}`;

        // Remove inscrições do teste anterior deste mesmo pedido (cobre troca de lote).
        const antigasSnap = await db.collection('registrations').where('pedidoId', '==', pedidoId).get();

        const batch = db.batch();
        antigasSnap.docs.forEach(d => batch.delete(d.ref));

        batch.set(db.collection('pedidos').doc(pedidoId), {
            id: pedidoId,
            valor: valorTotal,
            eventId,
            eventTitle: eventData.title || '',
            userId: uid,
            clienteNome: callerName,
            clienteEmail: callerEmail,
            status: 'pago',
            isTeste: true,
            itensComprados: itensComprados.length ? itensComprados : null,
            dataCriacao: FieldValue.serverTimestamp(),
            dataPagamento: FieldValue.serverTimestamp(),
        });

        const baseReg = {
            eventId,
            userId: uid,
            userName: callerName,
            userEmail: callerEmail,
            userPhone: '',
            userCpf: '',
            paymentStatus: 'Pago (Teste)',
            isTeste: true,
            pedidoId,
            timestamp: new Date().toISOString(),
        };

        const registrations = [];
        if (itensComprados.length > 0) {
            for (const item of itensComprados) {
                for (let q = 0; q < item.quantity; q++) {
                    const registrationId = `regteste_${eventId}_${uid}_${item.id}_${q}`;
                    const regData = { ...baseReg, id: registrationId, ticketTypeId: item.id, ticketTypeName: item.name };
                    batch.set(db.collection('registrations').doc(registrationId), regData);
                    registrations.push(regData);
                }
            }
        } else {
            const registrationId = `regteste_${eventId}_${uid}`;
            const regData = { ...baseReg, id: registrationId };
            batch.set(db.collection('registrations').doc(registrationId), regData);
            registrations.push(regData);
        }

        await batch.commit();

        logger.info(`Ingresso(s) de teste gerado(s) por ${callerEmail} no evento ${eventId}: ${registrations.length}.`);
        return { success: true, pedidoId, registrations };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.error('Erro ao criar ingresso de teste:', error);
        throw new HttpsError('internal', 'Erro ao criar ingresso de teste.');
    }
});

exports.onRegistrationCreated = onDocumentCreated("registrations/{registrationId}", async (event) => {
    const data = event.data.data();
    // Ingressos de teste (gerados por admin) não entram na contagem real de presença.
    if (!data.eventId || data.isTeste === true) return;
    try {
        await db.collection("events").doc(data.eventId).update({
            registrationCount: FieldValue.increment(1)
        });
        logger.info(`Incremented registration count for event ${data.eventId}`);
    } catch (error) {
        logger.error(`Error incrementing registration count for event ${data.eventId}:`, error);
    }
});

exports.onRegistrationDeleted = onDocumentDeleted("registrations/{registrationId}", async (event) => {
    const data = event.data.data();
    // Ingressos de teste nunca incrementaram a contagem — não decrementam ao serem removidos.
    if (!data.eventId || data.isTeste === true) return;
    try {
        await db.collection("events").doc(data.eventId).update({
            registrationCount: FieldValue.increment(-1)
        });
        logger.info(`Decremented registration count for event ${data.eventId}`);
    } catch (error) {
        logger.error(`Error decrementing registration count for event ${data.eventId}:`, error);
    }
});


