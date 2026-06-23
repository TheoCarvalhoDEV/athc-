import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'atche-sistemas-test',
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  describe('Profiles Collection', () => {
    it('allows anyone to read profiles', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      const ref = doc(db, 'profiles/alice');
      await getDoc(ref);
    });

    it('allows owner to write their profile with type user', async () => {
      const db = testEnv.authenticatedContext('alice', { email: 'alice@test.com' }).firestore();
      const ref = doc(db, 'profiles/alice');
      await setDoc(ref, { name: 'Alice', type: 'user' });
    });

    it('denies owner from escalating privilege by setting type to admin or atletica', async () => {
      const db = testEnv.authenticatedContext('alice', { email: 'alice@test.com' }).firestore();
      const ref = doc(db, 'profiles/alice');
      try {
        await setDoc(ref, { name: 'Alice', type: 'admin' });
        throw new Error('Escreveu com sucesso, mas deveria ser negado');
      } catch (err: any) {
        if (err.message.includes('Escreveu com sucesso')) throw err;
      }
    });

    it('denies others from writing a profile', async () => {
      const db = testEnv.authenticatedContext('bob', { email: 'bob@test.com' }).firestore();
      const ref = doc(db, 'profiles/alice');
      
      try {
        await setDoc(ref, { name: 'Alice Modificada por Bob' });
        throw new Error('Escreveu com sucesso, mas deveria ser negado');
      } catch (err: any) {
        if (err.message.includes('Escreveu com sucesso')) {
          throw err;
        }
      }
    });

    it('allows admin to write any profile', async () => {
      const db = testEnv.authenticatedContext('admin', { email: 'admin@atche.com.br' }).firestore();
      const ref = doc(db, 'profiles/alice');
      await setDoc(ref, { name: 'Alice Modificada por Admin', type: 'atletica' });
    });
  });

  describe('Events Collection', () => {
    it('allows anyone to read events', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      const ref = doc(db, 'events/event-1');
      await getDoc(ref);
    });

    it('denies standard user (not partner) from creating events', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const ref = doc(db, 'events/event-1');
      try {
        await setDoc(ref, { creatorId: 'alice', title: 'Festa da Alice' });
        throw new Error('Escreveu com sucesso, mas deveria ser negado');
      } catch (err: any) {
        if (err.message.includes('Escreveu com sucesso')) throw err;
      }
    });

    it('denies unauthenticated users from creating events', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      const ref = doc(db, 'events/event-1');
      try {
        await setDoc(ref, { creatorId: 'anonymous', title: 'Festa Anonima' });
        throw new Error('Escreveu com sucesso, mas deveria ser negado');
      } catch (err: any) {
        if (err.message.includes('Escreveu com sucesso')) throw err;
      }
    });
  });

  describe('Registrations Collection', () => {
    it('allows client to create registration with paymentStatus Gratuito', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const ref = doc(db, 'registrations/reg-1');
      await setDoc(ref, {
        eventId: 'evt-1',
        userName: 'Alice',
        userEmail: 'alice@test.com',
        paymentStatus: 'Gratuito'
      });
    });

    it('denies client from creating registration with paymentStatus Pago', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const ref = doc(db, 'registrations/reg-1');
      try {
        await setDoc(ref, {
          eventId: 'evt-1',
          userName: 'Alice',
          userEmail: 'alice@test.com',
          paymentStatus: 'Pago'
        });
        throw new Error('Escreveu com sucesso, mas deveria ser negado');
      } catch (err: any) {
        if (err.message.includes('Escreveu com sucesso')) throw err;
      }
    });
  });

  describe('Pedidos Collection', () => {
    it('denies direct write to anyone', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const ref = doc(db, 'pedidos/pedido-1');
      try {
        await setDoc(ref, { userId: 'alice', status: 'pago' });
        throw new Error('Escreveu com sucesso, mas deveria ser negado');
      } catch (err: any) {
        if (err.message.includes('Escreveu com sucesso')) throw err;
      }
    });
  });
});
