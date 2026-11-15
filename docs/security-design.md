# Security design and implementation status

## Trust boundaries

The browser is untrusted. API identity and ownership checks authorize resources; frontend plan gates only explain availability. Worker side effects need durable identity and recovery. Secrets must never enter a client bundle or public fixture.

## Present in this showcase

- Local/demo environment defaults and reduced integration boundaries.
- Domain authorization and payment/ledger examples retained for review.
- ESLint package import restrictions for web, node services and shared packages.
- `pnpm public:check`: tracked-text checks for disallowed commercial identifiers, known private host patterns and common credential formats. Whole files are not exempted.

The public-content check is a focused publication guard, not a complete secret scanner. It does not certify Git history or detect every credential type.

## Production lessons, not claims of completed demo coverage

The separately maintained product uses additional controls around external downloads and authenticated media. The relevant principles are DNS-to-connection pinning, public-address validation, a total operation deadline, redirect revalidation, response disposal and same-origin credential policy. This refresh does not claim to transplant or independently validate every production control in this snapshot.

Security tooling should combine secret scanning, dependency advisories, architecture rules and behavioral tests. Passing static checks is not proof against SSRF, unsafe media arguments or incorrect financial transitions.

## Publication rules

Do not add production keys, service hosts, merchant identifiers, customer records, vendor correspondence, routing policy, model settings, prompts or negotiated economics. All example integration endpoints use reserved domains. Keep real credentials out of this repository even for local testing.

Old commits may contain identifiers that a current-tree sanitization removes. This change does not rewrite published history. Removing a tracked value does not revoke a credential; any independently confirmed exposed credential requires rotation.
