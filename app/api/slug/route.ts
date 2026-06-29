import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { buildSlugPrompt, cleanSlug, slugify } from '@/lib/example-prompts';

export async function POST(request: NextRequest) {
  try {
    const { prompt, apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }
    if (!prompt || !String(prompt).trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: buildSlugPrompt(prompt),
      config: { temperature: 0.3, maxOutputTokens: 30 },
    });

    let text = '';
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) if (part.text) text += part.text;
    }

    const slug = cleanSlug(text) || slugify(prompt) || 'image';
    return NextResponse.json({ slug });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to generate slug' },
      { status: 500 }
    );
  }
}
