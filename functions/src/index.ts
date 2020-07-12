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

    // Validate newUser´s store is defined:
    if (!newUser?.store) {
      functions.logger.info(`${prefix} Store must be defined`);
      return;
    }

    // Version not changed:
    if (prevUser && prevUser.store?.version === newUser.store?.version) {
      functions.logger.info(`${prefix} Store version was not changed`);
      return;
    }

    // Log version info:
    functions.logger.info(
      `${prefix} Store ${newUser.store.id} have been updated to version: ${newUser.store.version}`,
    );

    // Update proccess:
    try {
      // run elastic query to update all productos with a store with a version lower
      functions.logger.info(`${prefix} Updating user data...`);

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
                  lt: newUser.store.version,
                },
              },
            },
          },
          script: {
            source: `ctx._source["store"] = ${newUser.store}`,
          },
        },
      });

      functions.logger.info(
        `${prefix} - ${body.took.updated} products were SUCCESSFULLY UPDATED !`,
      );
    } catch (error) {
      functions.logger.error(`${prefix} Unspected error:`, error);
    }
  });
