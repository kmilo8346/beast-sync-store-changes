import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import snakeCaseKeys from "snakecase-keys";

import elastic from "./lib/elastic";

admin.initializeApp();
const prefix = "[sync store changes function]";
const createIndexIfNotExist = async (index: string, body: any) => {
  const response = await elastic.indices.exists({ index });
  if (!response.body) {
    functions.logger.info(`${prefix} Creating ${index} index`);
    await elastic.indices.create({
      index,
      body,
    });
  }
};

exports.syncStoreChanges = functions.firestore
  .document("users/{userId}")
  .onWrite(async (change, context) => {
    const prevUser = change.before.data();
    const newUser = change.after.data();

    functions.logger.info(`${prefix} prev user`, prevUser);
    functions.logger.info(`${prefix} new user`, newUser);

    if (!newUser?.store) {
      functions.logger.info(`${prefix} Store must be defined`);
      return;
    }

    if (prevUser?.store?.version === newUser.store?.version) {
      functions.logger.info(`${prefix} Store version was not changed`);
      return;
    }

    functions.logger.info(
      `${prefix} Store ${newUser.store.id} have been updated to version: ${newUser.store.version}`
    );

    try {
      await Promise.all([
        createIndexIfNotExist("stores", {
          mappings: {
            properties: {
              id: { type: "keyword" },
              delivery_time: { type: "integer_range" },
              delivery_area: { type: "geo_shape", "strategy" : "recursive" },
              opening_hours: { type: "nested" },
            },
          },
        }),
        createIndexIfNotExist(`products-${newUser.store.id}`, {
          mappings: {
            properties: {
              type: { type: "keyword" },
              description: { type: "text" },
              format: { type: "text" },
              store: {
                properties: {
                  id: { type: "keyword" },
                  delivery_time: { type: "integer_range" },
                  delivery_area: { type: "geo_shape", "strategy" : "recursive" },
                  opening_hours: { type: "nested" },
                },
              },
            },
          },
        }),
      ]);

      // creating new store
      let newStore = { ...newUser.store };
      if (newStore.deliveryArea) {
        newStore.deliveryArea = {
          "type": "circle",
          "radius": newUser.store.deliveryArea.radius,
          "coordinates": [
            newUser.store.deliveryArea.center.geometry.location.lng,
            newUser.store.deliveryArea.center.geometry.location.lat,
          ]
        }
        functions.logger.info(
          `${prefix} Generated area`,
          newStore.deliveryArea
        );
      }

      // converting to sanke case
      newStore = snakeCaseKeys(newStore, { deep: true });

      functions.logger.info(`${prefix} Upserting store and updating products store info`, newStore);
      const results = await Promise.all([
        elastic.update({
          index: "stores",
          refresh: "true",
          id: newStore.id,
          body: {
            doc: newStore,
            doc_as_upsert: true,
          },
        }),
        elastic.updateByQuery({
          index: "products-*",
          refresh: true,
          body: {
            query: {
              bool: {
                filter: [
                  { term: { "store.id": newStore.id } },
                  { range: { "store.version": { lt: newStore.version } } },
                ],
              },
            },
            script: {
              lang: "painless",
              source: "ctx._source['store'] = params.newStore",
              params: {
                newStore,
              },
            },
          },
        })
      ]);

      functions.logger.info(
        `${prefix} ${results[1].body.updated} products were successfully updated!`
      );
    } catch (error) {
      functions.logger.error(`${prefix} Unexpected error:`, error);
      // TODO: add throw
    }
  });
