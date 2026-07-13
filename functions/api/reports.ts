import {
  createReportHttpRuntimeFromEnvironment,
  type ReportHttpEnvironment,
} from '../../src/submissions/report-http-environment';
import {
  createReportHttpHandler,
  type ReportHttpPagesContext,
} from '../../src/submissions/report-http';

export type ReportPagesContext = ReportHttpPagesContext<ReportHttpEnvironment>;

export const onRequestPost = createReportHttpHandler({
  runtimeFromEnvironment: createReportHttpRuntimeFromEnvironment,
});
