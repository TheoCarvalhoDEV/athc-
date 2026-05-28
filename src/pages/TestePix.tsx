import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getFirestore, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { loadMercadoPago } from '@mercadopago/sdk-js';

export const TestePix = () => {
    const [loading, setLoading] = useState(false);
    const [qrCodeData, setQrCodeData] = useState<{ qr_code: string, qr_code_base64: string } | null>(null);
    const [statusPagamento, setStatusPagamento] = useState<'pendente' | 'pago'>('pendente');
    const [pedidoId] = useState(`TESTE-${Date.now()}`);
    
    // Configurar o Firebase Functions para apontar pro localhost se não estiver no env prod
    const functions = getFunctions();
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && import.meta.env.VITE_USE_EMULATORS === 'true') {
        connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    }
    
    const db = getFirestore();

    // Inicialização do SDK V2 do Mercado Pago no Frontend + Script de Segurança
    useEffect(() => {
        const initMP = async () => {
            const publicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY;
            if (publicKey && publicKey !== 'APP_USR-COLOQUE_SUA_PUBLIC_KEY_AQUI') {
                try {
                    await loadMercadoPago();
                    new (window as any).MercadoPago(publicKey, { locale: 'pt-BR' });
                    console.log("Mercado Pago SDK inicializado com sucesso no frontend de teste.");
                } catch (err) {
                    console.error("Erro ao inicializar o Mercado Pago SDK:", err);
                }
            }
        };
        initMP();

        // Injeta o script de segurança dinamicamente para o checkout de teste se já não existir
        const isAlreadyLoaded = !!(window as any).MP_DEVICE_SESSION_ID || 
                                !!document.querySelector('script[src*="mercadopago.com/v2/security.js"]');
        
        if (!isAlreadyLoaded) {
            const scriptId = 'mp-security-script';
            const script = document.createElement('script');
            script.id = scriptId;
            script.src = 'https://www.mercadopago.com/v2/security.js';
            script.setAttribute('view', 'checkout');
            script.setAttribute('output', 'MP_DEVICE_SESSION_ID');
            script.async = true;

            try {
                Object.defineProperty(document, 'currentScript', {
                    get: () => document.getElementById(scriptId) || script,
                    configurable: true
                });
            } catch (e) {
                console.warn("Não foi possível interceptar document.currentScript", e);
            }

            script.onload = () => {
                console.log("Script de segurança do Mercado Pago (security.js) injetado dinamicamente no teste.");
                try {
                    delete (document as any).currentScript;
                } catch (e) {}
            };

            script.onerror = () => {
                console.error("Erro ao carregar script de segurança dinamicamente no teste.");
                try {
                    delete (document as any).currentScript;
                } catch (e) {}
            };

            document.body.appendChild(script);
        }
    }, []);

    const pedido = {
        pedidoId,
        valor: 1.50,
        cpf: '12345678909', 
        email: 'comprador_regular@gmail.com' // Email ficticio para testar no ambiente de testes
    };

    const handlePagarPix = async () => {
        setLoading(true);
        try {
            // Captura o Device Session ID gerado pelo script de segurança do Mercado Pago
            // Captura o Device Session ID por ordem de prioridade (variável global -> input oculto -> vazio)
            const deviceId = (window as any).MP_DEVICE_SESSION_ID || 
                             (document.getElementById('MP_DEVICE_SESSION_ID') as HTMLInputElement)?.value || 
                             (document.getElementById('deviceId') as HTMLInputElement)?.value || 
                             '';
            const pedidoComDevice = {
                ...pedido,
                deviceId
            };
            const criarCobrancaPix = httpsCallable(functions, 'criarCobrancaPix');
            const result = await criarCobrancaPix(pedidoComDevice);
            const data = result.data as any;
            
            setQrCodeData({
                qr_code: data.qr_code,
                qr_code_base64: data.qr_code_base64
            });
        } catch (error: any) {
            console.error("Erro ao gerar Pix:", error);
            alert("Erro ao processar: " + (error.message || "Verifique o console"));
        } finally {
            setLoading(false);
        }
    };

    const simularAprovacao = async () => {
        try {
            const docRef = doc(db, 'pedidos', pedidoId);
            await updateDoc(docRef, { status: 'pago' });
        } catch (error: any) {
            console.error("Erro ao simular aprovação:", error);
            alert("Erro ao simular: " + error.message);
        }
    };

    const copiarCodigo = () => {
        if (qrCodeData?.qr_code) {
            navigator.clipboard.writeText(qrCodeData.qr_code);
            alert("Código Pix copiado com sucesso!");
        }
    };

    useEffect(() => {
        if (!qrCodeData) return; 
        console.log(`Aguardando pagamento do pedido ${pedidoId}...`);
        
        const docRef = doc(db, 'pedidos', pedidoId);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const dados = docSnap.data();
                if (dados.status === 'pago') {
                    setStatusPagamento('pago');
                }
            }
        });

        return () => unsubscribe();
    }, [qrCodeData, pedidoId]);

    if (statusPagamento === 'pago') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="flex flex-col items-center justify-center p-12 bg-green-50 rounded-2xl shadow-sm border border-green-100">
                    <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-green-200">
                        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <h2 className="text-3xl font-bold text-green-700 mb-2">Pagamento Confirmado!</h2>
                    <p className="text-green-600">Obrigado! Seu pagamento foi processado com sucesso.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <input type="hidden" id="MP_DEVICE_SESSION_ID" name="MP_DEVICE_SESSION_ID" />
            <input type="hidden" id="deviceId" />
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 font-sans p-8">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Teste Real - Integração PIX</h2>
                
                <div className="mb-6 pb-6 border-b border-gray-100 text-gray-600 space-y-3">
                    <div className="flex justify-between"><span>Pedido ID:</span> <span className="font-medium text-gray-900">{pedido.pedidoId}</span></div>
                    <div className="flex justify-between"><span>Cliente:</span> <span className="font-medium text-gray-900">{pedido.email}</span></div>
                    <div className="flex justify-between text-lg pt-2 border-t border-gray-50 mt-4">
                        <span className="font-medium">Total:</span> 
                        <span className="font-bold text-blue-600">R$ {pedido.valor.toFixed(2).replace('.', ',')}</span>
                    </div>
                </div>

                {!qrCodeData ? (
                    <button 
                        onClick={handlePagarPix}
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-4 rounded-xl transition-all shadow-md shadow-blue-200 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
                    >
                        {loading ? 'Processando e autenticando...' : 'Pagar com Pix'}
                    </button>
                ) : (
                    <div className="flex flex-col items-center">
                        <p className="text-sm text-gray-500 mb-6 text-center font-medium">Escaneie o QR Code no app do seu banco ou copie o código Pix Copia e Cola.</p>
                        
                        <div className="p-3 bg-white border-2 border-blue-50 rounded-2xl shadow-sm mb-6 w-full flex justify-center">
                            {qrCodeData.qr_code_base64 ? (
                                <img 
                                    src={`data:image/jpeg;base64,${qrCodeData.qr_code_base64}`} 
                                    alt="QR Code Pix" 
                                    className="w-56 h-56 rounded-lg object-contain"
                                />
                            ) : (
                                <div className="w-56 h-56 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg">QR Code Indisponível</div>
                            )}
                        </div>
                        
                        <button 
                            onClick={copiarCodigo}
                            className="w-full bg-gray-50 hover:bg-gray-100 text-gray-800 font-semibold py-3 px-4 rounded-xl mb-4 transition-colors border border-gray-200 flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            Copiar Pix Copia e Cola
                        </button>

                        <button 
                            onClick={simularAprovacao}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl mb-6 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg shadow-emerald-100"
                        >
                            Simular Aprovação (Apenas Teste)
                        </button>

                        <div className="flex items-center text-sm font-medium text-blue-600 bg-blue-50 py-2 px-4 rounded-full w-full justify-center">
                            <span className="relative flex h-3 w-3 mr-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                            </span>
                            Aguardando confirmação do webhook...
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TestePix;
