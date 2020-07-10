import * as functions from 'firebase-functions';
import { Client, ClientOptions } from '@elastic/elasticsearch';

const prefix = '[elastic client]';


const clientOptions: ClientOptions = {
  node: functions.config().elastic.node,
};
const username = functions.config().elastic.username;
const password = functions.config().elastic.password;
const withBasicAuth = username && password;
if (withBasicAuth) {
  clientOptions.auth = { username, password };
}


functions.logger.info(`${prefix} Creating elastic client`);
functions.logger.info(`${prefix} Elastic Node: ${clientOptions.node}`);
if (withBasicAuth) {
    functions.logger.info(`${prefix} Elastic Basic Auth: ${username} *******`);
}
functions.logger.info('');

export default new Client(clientOptions);
