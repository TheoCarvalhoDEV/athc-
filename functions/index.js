const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// TOKEN_MP_TESTE_AQUI - Substituir com o Token TEST- do usuário
const mpAccessToken = process.env.MP_ACCESS_TOKEN || "APP_USR-8994816777129240-052517-c89f31f9f747b822cec9dfdfc54ece96-319387696";

const client = new MercadoPagoConfig({ accessToken: mpAccessToken, options: { timeout: 10000 } });
const payment = new Payment(client);

exports.criarCobrancaPix = onCall({ cors: true }, async (request) => {
    const data = request.data;
    const { valor, cpf, email, pedidoId } = data;
    
    if (!valor || !email || !pedidoId) {
        throw new HttpsError('invalid-argument', 'Dados incompletos para gerar o Pix.');
    }

    try {
        const idempotencyKey = `${pedidoId}_${Date.now()}`;

        // Extrai e formata o nome do comprador
        const clienteNome = data.clienteNome || "Comprador Ficticio";
        const nameParts = clienteNome.trim().split(/\s+/);
        const firstName = nameParts[0] || "Comprador";
        const lastName = nameParts.slice(1).join(" ") || "Atche";

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
        const eventId = data.eventId || "ingresso";
        const eventTitle = data.eventTitle || "Ingresso Atche";
        const eventDescription = data.eventDescription || `Ingresso para o evento ID ${eventId}`;

        const body = {
            transaction_amount: Number(valor),
            description: `Ingresso Atche - Pedido ${pedidoId}`.substring(0, 60),
            payment_method_id: 'pix',
            external_reference: pedidoId,
            payer: {
                email: email,
                first_name: firstName,
                last_name: lastName,
                phone: {
                    area_code: areaCode,
                    number: phoneNumber
                },
                identification: {
                    type: 'CPF',
                    number: cleanCpf
                },
                address: {
                    zip_code: '01001000',
                    street_name: 'Praca da Se',
                    street_number: '1',
                    neighborhood: 'Se',
                    city: 'Sao Paulo',
                    federal_unit: 'SP'
                }
            },
            additional_info: {
                items: [
                    {
                        id: eventId,
                        title: eventTitle.substring(0, 30),
                        description: eventDescription.substring(0, 60),
                        category_id: 'tickets',
                        quantity: 1,
                        unit_price: Number(valor)
                    }
                ],
                payer: {
                    first_name: firstName,
                    last_name: lastName,
                    phone: {
                        area_code: areaCode,
                        number: phoneNumber
                    },
                    address: {
                        zip_code: '01001000',
                        street_name: 'Praca da Se',
                        street_number: '1'
                    },
                    registration_date: new Date().toISOString()
                }
            },
            notification_url: 'https://webhookmercadopago-dfjumiogoq-uc.a.run.app'
        };

        const mpResponse = await payment.create({
            body,
            requestOptions: { idempotencyKey }
        });

        await db.collection('pedidos').doc(pedidoId).set({
            id: pedidoId,
            valor: Number(valor),
            clienteEmail: email,
            clienteNome: clienteNome,
            clienteTelefone: clienteTelefone,
            clienteCpf: cleanCpf,
            eventId: eventId,
            userId: data.userId || '',
            status: 'pendente',
            mercadoPagoPaymentId: mpResponse.id,
            dataCriacao: FieldValue.serverTimestamp(),
        }, { merge: true });

        return {
            id: mpResponse.id,
            qr_code: mpResponse.point_of_interaction?.transaction_data?.qr_code,
            qr_code_base64: mpResponse.point_of_interaction?.transaction_data?.qr_code_base64
        };

    } catch (error) {
        logger.error("Erro ao criar cobrança Pix:", error);
        throw new HttpsError('internal', 'Erro ao processar pagamento Pix.');
    }
});

exports.webhookMercadoPago = onRequest(async (req, res) => {
    cors(req, res, async () => {
        const paymentId = req.query.id || req.body?.data?.id || req.body?.id;
        logger.info("Webhook payload recebido. Query:", req.query, "Body:", req.body, "Parsed ID:", paymentId);

        if (!paymentId) {
            res.status(400).send('ID do pagamento não fornecido.');
            return;
        }

        try {
            const mpPaymentInfo = await payment.get({ id: paymentId });
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
            
            if (statusReal === 'approved' && dadosPedido.status !== 'pago') {
                await pedidoDoc.ref.update({
                    status: 'pago',
                    dataPagamento: FieldValue.serverTimestamp()
                });
                
                const registrationId = `reg_${dadosPedido.eventId}_${dadosPedido.userId}_${Date.now()}`;
                await db.collection('registrations').doc(registrationId).set({
                    id: registrationId,
                    eventId: dadosPedido.eventId || '',
                    userId: dadosPedido.userId || '',
                    userName: dadosPedido.clienteNome || '',
                    userEmail: dadosPedido.clienteEmail || '',
                    userPhone: dadosPedido.clienteTelefone || '',
                    userCpf: dadosPedido.clienteCpf || '',
                    paymentStatus: 'Pago',
                    timestamp: new Date().toISOString()
                });

                logger.info(`Sucesso: Pedido ${pedidoDoc.id} foi pago! Inscrição ${registrationId} criada.`);
            }

            res.status(200).send('Webhook processado.');

        } catch (error) {
            logger.error('Erro ao processar webhook:', error);
            res.status(500).send('Erro interno do servidor.');
        }
    });
});
