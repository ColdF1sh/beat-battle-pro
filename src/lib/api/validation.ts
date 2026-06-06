import { NextResponse } from "next/server";
import type { z } from "zod";
import { ZodError } from "zod";

export type ValidationDetail = {
  field: string;
  message: string;
};

export function formatZodError(error: ZodError): ValidationDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : "body",
    message: issue.message,
  }));
}

export function jsonValidationError(details: ValidationDetail[]) {
  return NextResponse.json(
    {
      error: "Validation failed",
      details,
    },
    { status: 400 },
  );
}

export async function validateJsonBody<T>(
  request: Request,
  schema: z.Schema<T>,
): Promise<
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      response: NextResponse;
    }
> {
  try {
    const body: unknown = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return {
        success: false,
        response: jsonValidationError(formatZodError(parsed.error)),
      };
    }

    return {
      success: true,
      data: parsed.data,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        success: false,
        response: jsonValidationError([
          {
            field: "body",
            message: "Invalid JSON request body.",
          },
        ]),
      };
    }

    throw error;
  }
}

export function validateSearchParams<T>(
  searchParams: URLSearchParams,
  schema: z.Schema<T>,
):
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      response: NextResponse;
    } {
  const parsed = schema.safeParse(Object.fromEntries(searchParams.entries()));

  if (!parsed.success) {
    return {
      success: false,
      response: jsonValidationError(formatZodError(parsed.error)),
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}
