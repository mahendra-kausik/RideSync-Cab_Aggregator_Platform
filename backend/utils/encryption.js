const crypto = require('crypto');

/**
 * Enhanced PII Encryption Utility
 * Implements AES-256-GCM encryption for field-level PII data protection
 * Provides secure encryption/decryption with authentication tags
 */

class EncryptionUtils {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16;  // 128 bits
        this.tagLength = 16; // 128 bits
        this.saltLength = 32; // 256 bits

        // Get encryption key from environment
        this.encryptionKey = process.env.ENCRYPTION_KEY;

        if (!this.encryptionKey) {
            console.warn('⚠️  ENCRYPTION_KEY not provided. PII fields will not be encrypted!');
            return;
        }

        if (this.encryptionKey.length < this.keyLength) {
            console.warn('⚠️  ENCRYPTION_KEY too short. Minimum 32 characters required!');
            return;
        }

        // Derive key using PBKDF2 for additional security
        this.derivedKey = this.deriveKey(this.encryptionKey);
    }

    /**
     * Derive encryption key using PBKDF2
     * @param {string} password - Base encryption key
     * @returns {Buffer} - Derived key
     */
    deriveKey(password) {
        const salt = Buffer.from('cab-aggregator-salt-2024', 'utf8'); // Static salt for consistency
        return crypto.pbkdf2Sync(password, salt, 100000, this.keyLength, 'sha256');
    }

    /**
     * Encrypt sensitive PII data
     * @param {string} plaintext - Data to encrypt
     * @returns {string} - Encrypted data with IV and auth tag
     */
    encrypt(plaintext) {
        if (!this.derivedKey || !plaintext || typeof plaintext !== 'string') {
            return plaintext;
        }

        try {
            // Generate random IV for each encryption
            const iv = crypto.randomBytes(this.ivLength);

            // Create cipher (use createCipheriv, not deprecated createCipher)
            const cipher = crypto.createCipheriv(this.algorithm, this.derivedKey, iv);

            // Encrypt the data
            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Get authentication tag
            const authTag = cipher.getAuthTag();

            // Combine IV + authTag + encrypted data
            const combined = iv.toString('hex') + authTag.toString('hex') + encrypted;

            return combined;
        } catch (error) {
            console.error('Encryption failed:', error.message);
            return plaintext; // Return original data if encryption fails
        }
    }

    /**
     * Decrypt sensitive PII data
     * @param {string} encryptedData - Encrypted data with IV and auth tag
     * @returns {string} - Decrypted plaintext
     */
    decrypt(encryptedData) {
        if (!this.derivedKey || !encryptedData || typeof encryptedData !== 'string') {
            return encryptedData;
        }

        try {
            // Extract IV, auth tag, and encrypted data
            const ivHex = encryptedData.slice(0, this.ivLength * 2);
            const authTagHex = encryptedData.slice(this.ivLength * 2, (this.ivLength + this.tagLength) * 2);
            const encrypted = encryptedData.slice((this.ivLength + this.tagLength) * 2);

            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');

            // Create decipher (use createDecipheriv, not deprecated createDecipher)
            const decipher = crypto.createDecipheriv(this.algorithm, this.derivedKey, iv);
            decipher.setAuthTag(authTag);

            // Decrypt the data
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            // Only log decryption errors in non-test environments
            if (process.env.NODE_ENV !== 'test') {
                console.error('Decryption failed:', error.message);
            }
            return encryptedData; // Return encrypted data if decryption fails
        }
    }

    /**
     * Check if encryption is available
     * @returns {boolean} - True if encryption is properly configured
     */
    isAvailable() {
        return !!(this.derivedKey && this.encryptionKey);
    }

    /**
     * Encrypt multiple fields in an object
     * @param {Object} data - Object containing fields to encrypt
     * @param {string[]} fields - Array of field names to encrypt
     * @returns {Object} - Object with encrypted fields
     */
    encryptFields(data, fields) {
        if (!this.isAvailable() || !data || typeof data !== 'object') {
            return data;
        }

        const encrypted = { ...data };

        fields.forEach(field => {
            const value = this.getNestedValue(encrypted, field);
            if (value && typeof value === 'string') {
                this.setNestedValue(encrypted, field, this.encrypt(value));
            }
        });

        return encrypted;
    }

    /**
     * Decrypt multiple fields in an object
     * @param {Object} data - Object containing fields to decrypt
     * @param {string[]} fields - Array of field names to decrypt
     * @returns {Object} - Object with decrypted fields
     */
    decryptFields(data, fields) {
        if (!this.isAvailable() || !data || typeof data !== 'object') {
            return data;
        }

        const decrypted = { ...data };

        fields.forEach(field => {
            const value = this.getNestedValue(decrypted, field);
            if (value && typeof value === 'string') {
                this.setNestedValue(decrypted, field, this.decrypt(value));
            }
        });

        return decrypted;
    }

    /**
     * Get nested object value by dot notation
     * @param {Object} obj - Object to search
     * @param {string} path - Dot notation path (e.g., 'profile.name')
     * @returns {*} - Value at path
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    }

    /**
     * Set nested object value by dot notation
     * @param {Object} obj - Object to modify
     * @param {string} path - Dot notation path (e.g., 'profile.name')
     * @param {*} value - Value to set
     */
    setNestedValue(obj, path, value) {
        // Mongoose documents track nested-path changes for persistence only through
        // their own .set() API -- a plain `target[lastKey] = value` mutation is
        // visible in-memory (isModified() even returns true) but Mongoose silently
        // drops it when building the actual save's update document. Prefer .set()
        // when available (Mongoose documents); fall back to plain assignment for
        // ordinary objects (this utility also runs on plain data via
        // encryptFields/decryptFields, which aren't Mongoose documents).
        if (typeof obj.set === 'function') {
            obj.set(path, value);
            return;
        }
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    /**
     * Generate secure random token
     * @param {number} length - Token length in bytes
     * @returns {string} - Hex encoded random token
     */
    generateSecureToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Hash sensitive data for comparison (one-way)
     * @param {string} data - Data to hash
     * @returns {string} - SHA-256 hash
     */
    hashData(data) {
        if (!data || typeof data !== 'string') {
            return data;
        }

        return crypto.createHash('sha256').update(data).digest('hex');
    }
}

// Create singleton instance
const encryptionUtils = new EncryptionUtils();

module.exports = encryptionUtils;