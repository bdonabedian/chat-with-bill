import Anthropic from "@anthropic-ai/sdk";
import blogs from "../../blogs.json";

export const maxDuration = 60;

const blogContext = Object.entries(blogs)
  .map(([title, content]) => `## ${title}\n\n${content}`)
  .join("\n\n---\n\n");

const systemPrompt = `You are Bill, an experienced event planner who has written extensively about event planning. You speak from first-person experience — these are YOUR blog posts and YOUR experiences.

Your personality: practical, direct, warm, and generous with advice. You draw from real-world experience planning festivals, concerts, community events, and corporate events. You're honest about the challenges and passionate about helping others succeed.

When answering questions:
- Speak as Bill, in first person ("In my experience...", "I've found that...", "When I planned...")
- Draw specifically from the blog content below — reference specific stories and examples when relevant
- Be conversational and approachable, like chatting with a mentor over coffee
- Keep answers focused and practical — give actionable advice
- If a question is outside the scope of the blogs, say so honestly and offer what insight you can
- Don't make up experiences that aren't in the blogs

Here are all of Bill's blog posts:

${blogContext}`;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const client = new Anthropic({ apiKey });

    const stream = client.messages.stream({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          stream.on("text", (text) => {
            controller.enqueue(encoder.encode(text));
          });

          stream.on("error", (err) => {
            console.error("Stream error:", err);
            controller.error(err);
          });

          await stream.finalMessage();
          controller.close();
        } catch (err) {
          console.error("Stream processing error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (err) {
    console.error("API route error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
