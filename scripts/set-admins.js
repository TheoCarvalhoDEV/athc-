/**
 * Script de Inicialização de Administradores - Atchêi
 * 
 * Este script define o custom claim { admin: true } para os 3 e-mails administradores
 * padrão, permitindo que eles acessem o painel administrativo com segurança.
 * 
 * Requisitos:
 * 1. Arquivo de chave do Firebase Service Account (JSON)
 * 2. Variável de ambiente GOOGLE_APPLICATION_CREDENTIALS apontando para a chave
 * 
 * Execução:
 * node scripts/set-admins.js
 */

const admin = require('firebase-admin');

// Defina os e-mails dos administradores que serão migrados
const ADMIN_EMAILS = [
  'admin@atche.com.br',
  'theotheteo@gmail.com',
  'allanjipa123@gmail.com'
];

// Inicializa o Firebase Admin SDK
// Tenta carregar as credenciais padrão do ambiente
try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
  console.log("Firebase Admin SDK inicializado via Application Default Credentials.");
} catch (e) {
  console.error("Erro ao inicializar Firebase Admin com credenciais padrão.");
  console.error("Por favor, garanta que a variável GOOGLE_APPLICATION_CREDENTIALS está definida.");
  console.error("Exemplo no Windows (PowerShell): $env:GOOGLE_APPLICATION_CREDENTIALS=\"caminho/para/chave.json\"");
  process.exit(1);
}

const auth = admin.auth();

async function grantAdminClaims() {
  console.log(`Iniciando migração de claims para ${ADMIN_EMAILS.length} administradores...\n`);

  for (const email of ADMIN_EMAILS) {
    try {
      // 1. Localiza o usuário no Firebase Authentication pelo e-mail
      const user = await auth.getUserByEmail(email);
      console.log(`✓ Usuário encontrado: ${email} (UID: ${user.uid})`);

      // 2. Define o Custom Claim de administrador como true
      await auth.setCustomClaims(user.uid, { admin: true });
      console.log(`  ➔ Custom Claim 'admin: true' definido com sucesso!`);

      // 3. Opcional: Garante que o perfil do usuário no Firestore esteja atualizado
      const db = admin.firestore();
      const profileRef = db.collection('profiles').doc(user.uid);
      const profileDoc = await profileRef.get();
      
      if (profileDoc.exists) {
        await profileRef.update({ type: 'admin' });
        console.log(`  ➔ Perfil no Firestore atualizado para type: 'admin'.`);
      } else {
        console.log(`  ⚠ Perfil correspondente no Firestore não encontrado para o UID ${user.uid}.`);
      }
      
      console.log('--------------------------------------------------');
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.warn(`✗ Usuário não encontrado no Auth para o e-mail: ${email}`);
        console.warn(`  ➔ Certifique-se de que o usuário já criou a conta no aplicativo.`);
      } else {
        console.error(`✗ Erro ao processar o e-mail ${email}:`, error.message);
      }
      console.log('--------------------------------------------------');
    }
  }

  console.log("\nProcesso de migração concluído.");
}

grantAdminClaims();
