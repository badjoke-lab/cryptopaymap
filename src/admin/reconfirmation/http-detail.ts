export { createReconfirmationDetailGetHandler } from './http-detail-get';
export { createReconfirmationDetailPostHandler } from './http-detail-post';

import { createReconfirmationDetailGetHandler } from './http-detail-get';
import { createReconfirmationDetailPostHandler } from './http-detail-post';

export const onRequestGet = createReconfirmationDetailGetHandler();
export const onRequestPost = createReconfirmationDetailPostHandler();
