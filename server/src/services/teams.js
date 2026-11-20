import { randomBytes } from "node:crypto";

// Four players to a team — small enough that everyone pulls their weight.
export const MAX_TEAM_SIZE = 4;

// Invite codes skip lookalike characters (0/O, 1/I/l) so they read cleanly
// off a screen or a whiteboard.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(length = 8) {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}
