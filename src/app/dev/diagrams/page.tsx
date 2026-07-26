import { notFound } from 'next/navigation';
import { DiagramGallery } from './DiagramGallery';

export const metadata = { title: 'Diagram gallery (dev)' };

/** Dev-only visual gallery for the diagram-completion system: renders every registered template in
 * both answer and review modes so the interaction and styling can be iterated on without the AI /
 * auth round-trip. Not linked in navigation and 404s in production builds. */
export default function DiagramDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DiagramGallery />;
}
