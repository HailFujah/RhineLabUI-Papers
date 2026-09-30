import { servePaper } from "../../../server/paper-source";

export function onRequestGet(context: { params: { slug: string }; request: Request }) {
  return servePaper(context.params.slug, context.request.signal);
}
