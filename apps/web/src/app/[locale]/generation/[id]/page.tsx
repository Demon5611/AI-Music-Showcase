import { GenerationStatusPanel } from "@/features/generation/generation-status-panel";

interface GenerationPageProps {
  params: Promise<{ id: string }>;
}

export default async function GenerationPage({ params }: GenerationPageProps) {
  const { id } = await params;

  return <GenerationStatusPanel jobId={id} />;
}
