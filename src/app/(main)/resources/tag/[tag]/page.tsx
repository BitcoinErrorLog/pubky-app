import { redirect } from 'next/navigation';

export default async function ResourceTagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  redirect(`/search?tags=${encodeURIComponent(decodeURIComponent(tag))}`);
}
