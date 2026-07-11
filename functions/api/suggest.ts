import {
  createSuggestHttpRuntimeFromEnvironment,
  type SuggestHttpEnvironment,
} from '../../src/submissions/suggest-http-environment';
import {
  createSuggestHttpHandler,
  type SuggestHttpPagesContext,
} from '../../src/submissions/suggest-http';

export type SuggestPagesContext = SuggestHttpPagesContext<SuggestHttpEnvironment>;

export const onRequestPost = createSuggestHttpHandler({
  runtimeFromEnvironment: createSuggestHttpRuntimeFromEnvironment,
});
