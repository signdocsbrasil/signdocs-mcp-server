import { describe, it, expect } from 'vitest';
import { isPrivateAddress } from '../src/fetch-document.js';

describe('isPrivateAddress (SSRF guard)', () => {
  it('flags private/loopback/link-local IPv4', () => {
    for (const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','172.31.255.255','192.168.1.1','169.254.169.254','0.0.0.0','100.64.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });
  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8','1.1.1.1','34.237.96.73','172.15.0.1','172.32.0.1','192.169.0.1']) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });
  it('flags private/loopback IPv6 + mapped v4', () => {
    for (const ip of ['::1','::','fc00::1','fd12::1','fe80::1','::ffff:127.0.0.1','::ffff:10.0.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });
  it('allows public IPv6', () => {
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
  });
});
