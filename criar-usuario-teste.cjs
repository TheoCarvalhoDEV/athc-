const ACCESS_TOKEN = "TEST-8994816777129240-052517-9e0b396916f024f2f43f665d4c53360f-319387696";

async function criarUsuarioTeste() {
    console.log("Criando usuário de teste...");
    try {
        const response = await fetch("https://api.mercadopago.com/users/test", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                site_id: "MLB",
                description: "comprador"
            })
        });

        const data = await response.json();
        console.log("Resultado:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Erro ao criar usuário:", error);
    }
}

criarUsuarioTeste();
