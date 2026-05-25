const { MercadoPagoConfig, Payment } = require("mercadopago");
const fs = require('fs');

// Substitua com as chaves que você me enviou na imagem
const ACCESS_TOKEN = "TEST-8994816777129240-052517-9e0b396916f024f2f43f665d4c53360f-319387696";

const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN, options: { timeout: 10000 } });
const payment = new Payment(client);

async function gerarPixTest() {
    console.log("Iniciando requisição para o Mercado Pago...");
    try {
        const body = {
            transaction_amount: 1.50,
            description: 'Pagamento de Teste - Atchê',
            payment_method_id: 'pix',
            payer: {
                email: 'comprador_regular@gmail.com',
                first_name: 'APRO'
            }
        };

        const requestOptions = {
            idempotencyKey: `teste-pix-${Date.now()}`
        };

        const mpResponse = await payment.create({
            body,
            requestOptions
        });

        console.log("Cobrança gerada com sucesso! ID:", mpResponse.id, "Status:", mpResponse.status);
        
        const qrCode = mpResponse.point_of_interaction.transaction_data.qr_code;
        const qrCodeBase64 = mpResponse.point_of_interaction.transaction_data.qr_code_base64;

        // Gerar um HTML simples para visualizar o QR Code
        const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>QR Code Pix - Teste Mercado Pago</title>
            <style>
                body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f9f9f9; }
                .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; }
                img { width: 250px; height: 250px; border: 2px solid #eee; border-radius: 8px; margin-bottom: 20px; }
                input { width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px; }
                button { background-color: #009ee3; color: white; border: none; padding: 12px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; }
                button:hover { background-color: #0087c1; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Teste Real - Pagamento Pix</h2>
                <p>Valor: <strong>R$ 1,50</strong></p>
                <img src="data:image/jpeg;base64,${qrCodeBase64}" alt="QR Code Pix" />
                <p style="font-size: 14px; color: #666;">Copie o código abaixo (Pix Copia e Cola):</p>
                <input type="text" id="pixCode" value="${qrCode}" readonly />
                <button onclick="copiar()">Copiar Código</button>
            </div>
            <script>
                function copiar() {
                    const copyText = document.getElementById("pixCode");
                    copyText.select();
                    document.execCommand("copy");
                    alert("Código PIX copiado com sucesso!");
                }
            </script>
        </body>
        </html>
        `;

        fs.writeFileSync('meu-teste-pix.html', html);
        console.log("Sucesso! Arquivo 'meu-teste-pix.html' gerado na pasta do projeto.");

    } catch (error) {
        console.error("Erro ao gerar Pix:", error);
    }
}

gerarPixTest();
