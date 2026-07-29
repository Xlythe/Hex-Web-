/**
 * @file utils.ts
 * @description Provides utility functions used across the Hex game application.
 * This includes time formatting for timers, board creation logic with validation,
 * network UID generation, and MD5 hashing.
 */

import { CellState } from './types';    
import { NETWORK_UID_STORAGE_KEY } from './Constants';
import { safeStorageGet, safeStorageSet } from './storage';

/**
 * @function formatTime
 * @description Formats a given number of total seconds into a MM:SS string.
 * If the input is null, undefined, or negative, it returns '--:--' as a placeholder.
 *
 * @param {number | null | undefined} totalSeconds - The total number of seconds to format.
 * @returns {string} The formatted time string (e.g., "05:30" or "--:--").
 */
export const formatTime = (totalSeconds: number | null | undefined): string => {
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) return '--:--';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/**
 * @function createEmptyBoard
 * @description Creates a 2D array representing an empty game board of a specified size.
 * The board is filled with `null` values, indicating empty cells.
 * It validates the requested `size` against `minSize` and `maxSize`. If the `size`
 * is out of range, it logs a warning and uses `defaultSize` instead.
 *
 * @param {number} size - The desired dimension for the N x N board.
 * @param {number} minSize - The minimum allowed board size.
 * @param {number} maxSize - The maximum allowed board size.
 * @param {number} defaultSize - The size to use if the requested `size` is invalid.
 * @returns {CellState[][]} A 2D array (BoardMatrix) filled with `null`.
 */
export const createEmptyBoard = (size: number, minSize: number, maxSize: number, defaultSize: number): CellState[][] => {
  let finalSize = size;
  // Validate the requested board size.
  if (size < minSize || size > maxSize) {
    console.warn(`Board size ${size} is out of range (${minSize}-${maxSize}). Defaulting to ${defaultSize}.`);
    finalSize = defaultSize; // Use default size if requested size is invalid.
  }
  // Create an N x N array initialized with nulls.
  return Array(finalSize).fill(null).map(() => Array(finalSize).fill(null));
};

/**
 * @function generateRandomString
 * @description Generates a random alphanumeric string of a given length.
 * @param {number} length - The desired length of the random string.
 * @returns {string} The generated random string.
 */
const generateRandomString = (length: number): string => {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};


/**
 * @function getOrGenerateNetworkUid
 * @description Retrieves an existing network UID from localStorage or generates and stores a new one.
 * The UID will have a "web-" prefix and be at most 64 characters.
 * @returns {string} The network UID.
 */
export const getOrGenerateNetworkUid = (): string => {
  let networkUid = safeStorageGet(NETWORK_UID_STORAGE_KEY);
  if (!networkUid) {
    const prefix = "web-";
    // Generate a random part. Max length for random part is 64 - prefix.length.
    // Max random part is 60 chars. Each Math.random().toString(36).substring(2) gives about 11 chars.
    // So, 5-6 calls should be enough. We'll aim for slightly less to be safe with substring.
    let randomPart = '';
    for(let i = 0; i < 5; i++) {
        randomPart += Math.random().toString(36).substring(2);
    }
    // Ensure it fits within 64 total characters including prefix, and does not use invalid symbols (toString(36) is fine).
    networkUid = prefix + randomPart.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64 - prefix.length);
    
    safeStorageSet(NETWORK_UID_STORAGE_KEY, networkUid);
  }
  return networkUid;
};

const add = (x: number, y: number): number => {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
};

const rol = (num: number, cnt: number): number => {
  return (num << cnt) | (num >>> (32 - cnt));
};

const f = (x: number, y: number, z: number): number => (x & y) | (~x & z);
const g = (x: number, y: number, z: number): number => (x & z) | (y & ~z);
const h = (x: number, y: number, z: number): number => x ^ y ^ z;
const i = (x: number, y: number, z: number): number => y ^ (x | ~z);

const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number): number => {
  return add(rol(add(add(a, f(b, c, d)), add(x, t)), s), b);
};
const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number): number => {
  return add(rol(add(add(a, g(b, c, d)), add(x, t)), s), b);
};
const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number): number => {
  return add(rol(add(add(a, h(b, c, d)), add(x, t)), s), b);
};
const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number): number => {
  return add(rol(add(add(a, i(b, c, d)), add(x, t)), s), b);
};

const convertToWordArray = (inputStr: string): number[] => {
  const utf8Bytes = new TextEncoder().encode(inputStr);
  const messageLengthBits = utf8Bytes.length * 8;
  const result: number[] = [];

  for (let k = 0; k < utf8Bytes.length; k++) {
    result[k >> 2] |= utf8Bytes[k] << ((k % 4) * 8);
  }

  result[messageLengthBits >> 5] |= 0x80 << (messageLengthBits % 32);
  result[(((messageLengthBits + 64) >>> 9) << 4) + 14] = messageLengthBits;

  return result;
};

const wordToHex = (lValue: number): string => {
  let hex = '';
  for (let j = 0; j <= 3; j++) {
    hex += ((lValue >>> (j * 8)) & 0xff).toString(16).padStart(2, '0');
  }
  return hex;
};

/**
 * @function md5
 * @description Calculates the MD5 hash of a string.
 * Based on a common JavaScript MD5 implementation.
 * @param {string} str - The string to hash.
 * @returns {string} The MD5 hash as a 32-character hexadecimal string.
 */
export const md5 = (str: string): string => {
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const x = convertToWordArray(str);

  const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
  const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
  const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
  const S41 = 6, S42 = 10, S43 = 15, S44 = 21;

  for (let k = 0; k < x.length; k += 16) {
    const oldA = a;
    const oldB = b;
    const oldC = c;
    const oldD = d;

    a = ff(a, b, c, d, x[k + 0], S11, 0xd76aa478);
    d = ff(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
    c = ff(c, d, a, b, x[k + 2], S13, 0x242070db);
    b = ff(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
    a = ff(a, b, c, d, x[k + 4], S11, 0xf57c0faf);
    d = ff(d, a, b, c, x[k + 5], S12, 0x4787c62a);
    c = ff(c, d, a, b, x[k + 6], S13, 0xa8304613);
    b = ff(b, c, d, a, x[k + 7], S14, 0xfd469501);
    a = ff(a, b, c, d, x[k + 8], S11, 0x698098d8);
    d = ff(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
    c = ff(c, d, a, b, x[k + 10], S13, 0xffff5bb1);
    b = ff(b, c, d, a, x[k + 11], S14, 0x895cd7be);
    a = ff(a, b, c, d, x[k + 12], S11, 0x6b901122);
    d = ff(d, a, b, c, x[k + 13], S12, 0xfd987193);
    c = ff(c, d, a, b, x[k + 14], S13, 0xa679438e);
    b = ff(b, c, d, a, x[k + 15], S14, 0x49b40821);

    a = gg(a, b, c, d, x[k + 1], S21, 0xf61e2562);
    d = gg(d, a, b, c, x[k + 6], S22, 0xc040b340);
    c = gg(c, d, a, b, x[k + 11], S23, 0x265e5a51);
    b = gg(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
    a = gg(a, b, c, d, x[k + 5], S21, 0xd62f105d);
    d = gg(d, a, b, c, x[k + 10], S22, 0x02441453);
    c = gg(c, d, a, b, x[k + 15], S23, 0xd8a1e681);
    b = gg(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
    a = gg(a, b, c, d, x[k + 9], S21, 0x21e1cde6);
    d = gg(d, a, b, c, x[k + 14], S22, 0xc33707d6);
    c = gg(c, d, a, b, x[k + 3], S23, 0xf4d50d87);
    b = gg(b, c, d, a, x[k + 8], S24, 0x455a14ed);
    a = gg(a, b, c, d, x[k + 13], S21, 0xa9e3e905);
    d = gg(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
    c = gg(c, d, a, b, x[k + 7], S23, 0x676f02d9);
    b = gg(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);

    a = hh(a, b, c, d, x[k + 5], S31, 0xfffa3942);
    d = hh(d, a, b, c, x[k + 8], S32, 0x8771f681);
    c = hh(c, d, a, b, x[k + 11], S33, 0x6d9d6122);
    b = hh(b, c, d, a, x[k + 14], S34, 0xfde5380c);
    a = hh(a, b, c, d, x[k + 1], S31, 0xa4beea44);
    d = hh(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
    c = hh(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);
    b = hh(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
    a = hh(a, b, c, d, x[k + 13], S31, 0x289b7ec6);
    d = hh(d, a, b, c, x[k + 0], S32, 0xeaa127fa);
    c = hh(c, d, a, b, x[k + 3], S33, 0xd4ef3085);
    b = hh(b, c, d, a, x[k + 6], S34, 0x04881d05);
    a = hh(a, b, c, d, x[k + 9], S31, 0xd9d4d039);
    d = hh(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
    c = hh(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);
    b = hh(b, c, d, a, x[k + 2], S34, 0xc4ac5665);

    a = ii(a, b, c, d, x[k + 0], S41, 0xf4292244);
    d = ii(d, a, b, c, x[k + 7], S42, 0x432aff97);
    c = ii(c, d, a, b, x[k + 14], S43, 0xab9423a7);
    b = ii(b, c, d, a, x[k + 5], S44, 0xfc93a039);
    a = ii(a, b, c, d, x[k + 12], S41, 0x655b59c3);
    d = ii(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
    c = ii(c, d, a, b, x[k + 10], S43, 0xffeff47d);
    b = ii(b, c, d, a, x[k + 1], S44, 0x85845dd1);
    a = ii(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);
    d = ii(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
    c = ii(c, d, a, b, x[k + 6], S43, 0xa3014314);
    b = ii(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
    a = ii(a, b, c, d, x[k + 4], S41, 0xf7537e82);
    d = ii(d, a, b, c, x[k + 11], S42, 0xbd3af235);
    c = ii(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);
    b = ii(b, c, d, a, x[k + 9], S44, 0xeb86d391);

    a = add(a, oldA);
    b = add(b, oldB);
    c = add(c, oldC);
    d = add(d, oldD);
  }
  return wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
};
