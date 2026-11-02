import { describe, expect, it } from 'vitest';
import { hostOf, schoolDomains } from './domain';

describe('hostOf', () => {
  it('reads the host out of the shapes the registers actually publish', () => {
    // GIAS SchoolWebsite is inconsistent about the scheme and the www.
    expect(hostOf('http://www.clsg.org.uk')).toBe('clsg.org.uk');
    expect(hostOf('www.thealdgateschool.org')).toBe('thealdgateschool.org');
    expect(hostOf('https://millfieldhigh.sch.uk/contact?x=1')).toBe('millfieldhigh.sch.uk');
    // The Scottish register publishes a contact address in the same role.
    expect(hostOf('abbey@ea.n-ayrshire.sch.uk')).toBe('ea.n-ayrshire.sch.uk');
  });

  it('rejects anything that would let a stranger claim a school', () => {
    // A shared provider would match every teacher in the country.
    expect(hostOf('http://www.facebook.com/ourschool')).toBeNull();
    expect(hostOf('head@gmail.com')).toBeNull();
    // A bare public suffix would match every .sch.uk address there is.
    expect(hostOf('http://sch.uk')).toBeNull();
    expect(hostOf('co.uk')).toBeNull();
  });

  it('rejects values that are not hosts at all', () => {
    expect(hostOf('')).toBeNull();
    expect(hostOf(null)).toBeNull();
    expect(hostOf('   ')).toBeNull();
    expect(hostOf('not a url')).toBeNull();
    expect(hostOf('localhost')).toBeNull();
    expect(hostOf('school..sch.uk')).toBeNull();
  });
});

describe('schoolDomains', () => {
  it('de-duplicates the website and the contact address when they agree', () => {
    expect(schoolDomains(['http://www.abbey.sch.uk', 'office@abbey.sch.uk'])).toEqual(['abbey.sch.uk']);
  });

  it('keeps both when a school mails from a local-authority domain', () => {
    expect(schoolDomains(['https://abbeyhill.edin.sch.uk', 'admin@ea.edinburgh.gov.uk'])).toEqual([
      'abbeyhill.edin.sch.uk',
      'ea.edinburgh.gov.uk',
    ]);
  });

  it('is empty when nothing usable is on record, which is what blocks a claim', () => {
    expect(schoolDomains([null, '', 'head@gmail.com'])).toEqual([]);
  });
});

describe('shared multi-tenant hosts', () => {
  // The exploitable case: these hosts are all used as SUBDOMAINS in the real
  // registers, so an exact-match block list let them into schools.domains. Every
  // Scottish teacher holds a @glowscotland.org.uk address, so a stored domain of
  // stmarys.glowscotland.org.uk made that school claimable by all of them.
  it('rejects a school "domain" that is really a tenant of a shared host', () => {
    expect(hostOf('https://stmarys.glowscotland.org.uk')).toBeNull();
    expect(hostOf('http://myschool.wixsite.com/home')).toBeNull();
    expect(hostOf('https://stjohns.eschools.co.uk')).toBeNull();
    expect(hostOf('https://ourschool.secure-primarysite.net')).toBeNull();
    expect(hostOf('https://someschool.sharepoint.com')).toBeNull();
    expect(hostOf('https://ourschool.blogspot.com')).toBeNull();
  });

  it('still accepts a school on its own domain that merely resembles one', () => {
    // Not a subdomain of anything blocked -- 'wixsite.com' must not match
    // 'notwixsite.com', which endsWith() alone would get wrong without the dot.
    expect(hostOf('https://notwixsite.com')).toBe('notwixsite.com');
    expect(hostOf('https://abbey.sch.uk')).toBe('abbey.sch.uk');
  });
});

describe('website values containing an @', () => {
  // The old unconditional slice-at-last-@ turned these into a fragment with no
  // dot, returned null, and silently made the school unclaimable.
  it('reads the host from a URL whose path or query carries an @', () => {
    expect(hostOf('https://abbey.sch.uk/contact?to=head@abbey.sch.uk')).toBe('abbey.sch.uk');
    expect(hostOf('http://www.millfield.sch.uk/staff/@head')).toBe('millfield.sch.uk');
  });

  it('still reads a bare email address, which is how Scotland publishes contacts', () => {
    expect(hostOf('abbey@ea.n-ayrshire.sch.uk')).toBe('ea.n-ayrshire.sch.uk');
    expect(hostOf('mailto:head@abbey.sch.uk')).toBe('abbey.sch.uk');
  });
});
