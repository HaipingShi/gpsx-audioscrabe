/**
 * 后端加密服务
 * 使用 Web Crypto API 实现 AES-256-GCM 加密
 */

/**
 * 生成加密密钥
 * @param password 密码（通常使用环境变量中的主密钥）
 * @param salt 盐值
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // 导入密码作为密钥材料
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // 使用 PBKDF2 派生密钥
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 加密文本
 * @param text 要加密的文本
 * @param masterKey 主密钥（从环境变量获取）
 * @returns 加密后的数据（base64 编码）
 */
export async function encrypt(text: string, masterKey: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);

    // 生成随机盐和 IV
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 派生密钥
    const key = await deriveKey(masterKey, salt);

    // 加密数据
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      data
    );

    // 组合 salt + iv + encryptedData
    const combined = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encryptedData), salt.length + iv.length);

    // 转换为 base64
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * 解密文本
 * @param encryptedText 加密的文本（base64 编码）
 * @param masterKey 主密钥
 * @returns 解密后的文本
 */
export async function decrypt(encryptedText: string, masterKey: string): Promise<string> {
  try {
    // 从 base64 解码
    const combined = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));

    // 提取 salt, iv, encryptedData
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encryptedData = combined.slice(28);

    // 派生密钥
    const key = await deriveKey(masterKey, salt);

    // 解密数据
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      encryptedData
    );

    // 转换为文本
    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * 生成安全的随机 ID
 * @param length ID 长度
 */
export function generateId(length: number = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 哈希文本（用于验证）
 * @param text 要哈希的文本
 */
export async function hash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

