type PostAuthPathArgs = {
  nextPath: string | null;
  hasGuestResults: boolean;
  isNewUser: boolean;
};

export function getRequestedPostAuthPath(
  nextPath: string | null,
  hasGuestResults: boolean,
): string | null {
  if (nextPath) return nextPath;
  if (hasGuestResults) return "/results";
  return null;
}

export function getPostAuthPath({
  nextPath,
  hasGuestResults,
  isNewUser,
}: PostAuthPathArgs): string {
  return getRequestedPostAuthPath(nextPath, hasGuestResults)
    ?? (isNewUser ? "/app/roadmap" : "/app");
}
