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

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        stream: true,
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json(
        { error: `Anthropic API error: ${response.status} ${errorText}` },
        { status: 500 }
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return Response.json({ error: "No response body" }, { status: 500 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  if (
                    parsed.type === "content_block_delta" &&
                    parsed.delta?.type === "text_delta"
                  ) {
                    controller.enqueue(encoder.encode(parsed.delta.text));
                  }
                } catch {
                  // skip non-JSON lines
                }
              }
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
