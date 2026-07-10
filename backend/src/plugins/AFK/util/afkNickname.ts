export const afkNicknamePrefix = "[AFK] ";

const maxNicknameLength = 32;

export function buildAfkNickname(baseName: string): string {
  const combined = `${afkNicknamePrefix}${baseName}`;
  if ([...combined].length <= maxNicknameLength) {
    return combined;
  }

  const maxBaseLength = maxNicknameLength - afkNicknamePrefix.length;
  const truncatedBase = [...baseName].slice(0, maxBaseLength).join("");
  return `${afkNicknamePrefix}${truncatedBase}`;
}
