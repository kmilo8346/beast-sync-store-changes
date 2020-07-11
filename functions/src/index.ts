import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

import elastic from './lib/elastic';

admin.initializeApp();
const prefix = '[sync store changes function]';

exports.syncStoreChanges = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    const newUser = change.after.data();
    const prevUser = change.before.data();

    /**
     * Pre-requisites to execute elactic update:
     *
     * - User update: User must be UPDATED and not CREATED.
     * - Version upgrade: The Store version must be UPDATED to a greater value.
     * - MP customerId: Mercado Pago´s customerId most be present.
     *
     */

    // User update:
    if (!prevUser || !newUser) {
      functions.logger.info(
        `${prefix} User must be defined previosly to take action`,
      );
      return;
    }

    // Version upgrade:
    if (prevUser.store?.version >= newUser.store?.version) {
      functions.logger.info(`${prefix} Store version was not changed`);
      return;
    }

    // MP customerId:;
    if (!newUser.mercadoPago?.customerId) {
      functions.logger.info(
        `${prefix} User don´t has userId on mercadoPago pero no importa ;)`,
      );
      return;
    }

    // Log version info:
    functions.logger.info(
      `${prefix} Store ${newUser.store.id} have been updated from version: ${prevUser.store.version}, to: ${newUser.store.version}`,
    );

    // Update proccess:
    try {
      // run elastic query to update all productos with a store with a version lower
      functions.logger.info(`${prefix} Updating user data...`);

      // check for elastic health:
      const health = await elastic.cluster.health();
      functions.logger.info('Elastic health status: ', health?.body?.status);

      const { body } = await elastic.updateByQuery({
        index: 'products-*',
        body: {
          query: {
            filtered: {
              query: {
                match: {
                  'store.id': newUser.store.id,
                },
              },
              filter: {
                'store.version': {
                  lte: newUser.store.version,
                },
              },
            },
          },
          script: {
            source: `ctx._source["store"] = ${newUser.store}`,
          },
        },
      });

      // On UPDATE OK
      if (body.statusCode === 200) {
        functions.logger.info(
          `${prefix} - ${body.took.updated} products were SUCCESSFULLY UPDATED !`,
        );
      } else {
        throw new Error(
          `${prefix} - Something went wrong, update´s statusCode: ${body.statusCode}`,
        );
      }
    } catch (error) {
      // ON Elastic error
      functions.logger.error(`${prefix} Elastic Error: ${error}`);
    }
  });
