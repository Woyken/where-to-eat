async function sha256(message: string) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

async function getGravatarHash(email: string) {
  email = email.trim().toLowerCase();
  return await sha256(email);
}

async function getGravatarProfile(email: string) {
  const response = await fetch(
    `https://api.gravatar.com/v3/profiles/${getGravatarHash(email)}`,
    {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_GRAVATAR_KEY}`,
      },
    }
  );
  if (!response.ok) throw new Error("Failed to get Gravatar profile");

  const result = (await response.json()) as {
    display_name: string;
    avatar_url: string;
  };
  return result;
}
