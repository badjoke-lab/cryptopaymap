# P3-07J handoff checklist

**Pull request:** #58  
**Status:** Final CI validation

## Repository completion checks

- both promotion choices require `candidate:promote`
- both choices preserve the exact reviewed Candidate source set
- new canonical records use origin provenance
- reused Entity and Location fields use attribution provenance
- new Claim and Claim Asset fields on an existing target use origin provenance
- both choices create only hidden candidate Claims
- public or Confirmed Claims are rejected before backend mutation
- request fingerprints preserve replay and conflict behavior
- durable operations remain atomic
- protected reviewer workspaces submit explicit field-level provenance

## Deferred checks

- live Cloudflare Access verification
- live database transaction verification
- production deployment verification

After successful CI and merge, P3-07 is repository-complete and P3-08 Evidence review may begin.
