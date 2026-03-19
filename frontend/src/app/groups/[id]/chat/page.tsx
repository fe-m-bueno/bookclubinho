import { ChatContainer } from "@/components/chat/chat-container";

export const metadata = { title: "Chat" };

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  return <ChatContainer groupId={id} />;
}
