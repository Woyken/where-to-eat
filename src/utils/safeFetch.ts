import { err, ResultAsync } from "neverthrow";

type FetchError<E> = NetworkError | HttpError<E> | ParseError;

interface NetworkError {
  type: "network";
  error: Error;
}

interface HttpError<E = unknown> {
  type: "http";
  status: number;
  headers: Headers;
  json?: E;
}

interface ParseError {
  type: "parse";
  error: Error;
}

export function safeFetch<T = unknown, E = unknown>(
  input: URL | string,
  init?: RequestInit
): ResultAsync<T, FetchError<E>> {
  return ResultAsync.fromPromise(
    fetch(input, init),
    (error): NetworkError =>
      ({
        type: "network",
        error: error instanceof Error ? error : new Error(String(error)),
      } as const)
  ).andThen((response) => {
    if (!response.ok) {
      return ResultAsync.fromSafePromise(
        response.json().catch(() => undefined)
      ).andThen((json) =>
        err({
          type: "http",
          status: response.status,
          headers: response.headers,
          json: json as E,
        } as const)
      );
    }

    return ResultAsync.fromPromise(
      response.json() as Promise<T>,
      (error): ParseError => ({
        type: "parse",
        error: error instanceof Error ? error : new Error(String(error)),
      })
    );
  });
}
