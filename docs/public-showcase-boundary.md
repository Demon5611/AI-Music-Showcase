# Public Showcase Boundary

This repository is intentionally maintained as an engineering showcase, not as a public copy of the private production service.

## Publication rule

A sanitized refresh should demonstrate the engineering decision without publishing the production implementation detail that creates commercial or operational leverage.

Good public examples:

- stable provider interfaces;
- domain models and lifecycle states;
- deterministic mock providers;
- generic queue / retry / reconciliation patterns;
- local PostgreSQL / Redis / storage setup;
- authorization boundaries;
- media composition and output-validation concepts;
- safe screenshots and architecture diagrams.

Keep private:

- real external-provider adapters;
- exact request/response mappings;
- proprietary prompts or generation directives;
- exact model selection and model parameters;
- provider assignment / ranking / fallback rules;
- product-specific creative heuristics;
- commercial pricing, COGS, margins, quotas, and treasury data;
- credentials, account identifiers, production endpoints, and infrastructure IDs;
- internal runbooks, vendor correspondence, incidents, and private user data.

## Video example

Public:

```ts
interface VideoProvider {
  submit(...): Promise<...>;
  getStatus(...): Promise<...>;
  download(...): Promise<...>;
}
```

Private:

```text
vendor payload construction
model/version selection
prompt construction
creative-role assignment
fallback policy
vendor-specific retry handling
commercial routing
```

## Sanitization checklist

Before merging a refresh into the public default branch:

1. Review every new provider file for vendor-specific implementation details.
2. Replace real adapters with interfaces, mocks, or reduced examples where possible.
3. Search for credentials, tokens, merchant identifiers, private URLs, infrastructure IDs, balances, quotas, and real task IDs.
4. Search for exact costs, margins, package economics, and provider-specific commercial rules.
5. Review prompts, routing, model parameters, fallback logic, and product-specific heuristics for reconstruction value.
6. Confirm screenshots and fixtures contain no user/private operational data.
7. Run local typecheck, lint, tests, and build.
8. Verify the documented local quick-start on a clean environment.

## Design goal

A reviewer should be able to understand the architecture, code quality, reliability model, and product engineering decisions.

A reviewer should not receive a ready-made substitute for the private production service or the proprietary details needed to reproduce its provider behavior directly.
