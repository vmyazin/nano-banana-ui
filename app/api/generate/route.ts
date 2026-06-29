import { NextRequest, NextResponse } from 'next/server';
import { geminiGenerate } from '@/lib/engines/gemini';
import { pollinationsGenerate } from '@/lib/engines/pollinations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { engine = 'gemini', prompt, images, config, apiKey } = body;

    if (!prompt && !images?.length) {
      return NextResponse.json(
        { success: false, error: 'Prompt or image is required' },
        { status: 400 }
      );
    }

    let result;
    if (engine === 'pollinations') {
      result = await pollinationsGenerate({ prompt, aspectRatio: config?.aspectRatio });
    } else {
      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: 'API key is required' },
          { status: 400 }
        );
      }
      result = await geminiGenerate({ prompt, images, config, apiKey });
    }

    return NextResponse.json({
      success: true,
      imageData: result.imageData,
      mimeType: result.mimeType,
    });
  } catch (error: any) {
    console.error('Generation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to generate image',
        details: error?.response?.data?.error?.message || error?.toString(),
      },
      { status: 500 }
    );
  }
}
