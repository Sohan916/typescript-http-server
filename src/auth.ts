import { hash, verify } from "argon2";

export const hashPassword = (password: string): Promise<string> => {
  return hash(password);
};

export const checkPasswordHash = (
  password: string,
  hash: string,
): Promise<Boolean> => {
  return verify(hash, password);
};
