import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

import elastic from './lib/elastic';

admin.initializeApp();
const prefix = '[sync store changes function]'

exports.syncStoreChanges = functions.firestore
    .document('users/{userId}')
    .onWrite((change, context) => {
        const newUser = change.after.data();
        const prevUser = change.before.data();

        functions.logger.info(`${prefix} new value ${JSON.stringify(newUser?.as)} previosValue ${prevUser}`)

        if (!prevUser || !newUser) {
            functions.logger.info(`${prefix} User must be defined`)
            return;
        }
        // store must be completed -> user.mercadoPago.userId;
        // detect changes in store
        if (prevUser.store.version >= newUser.store.version) {
            functions.logger.info(`${prefix} Store version was not changed`)
            return;
        }


        // run elastic query to update all productos with a store with a version lower

        // actualizar todos los productos que tenga el store con una version más baja q la nueva version
        // a todos esos producto le pongo el nuevo store

        // elastic.update(script)



        // los errores tienen q ser capturados
        // elastic tiene q tener un timeout
        // hay q hacer loggin
        // probar todos los casos posibles
        // deployar en development y staging(probar en ambos ambientes)

});
