# @stellarguard/multisig-utils

Utilities for working with Stellar mulitsig.

## Installation

```bash
npm install @stellarguard/multisig-utils --save
# or
yarn add @stellarguard/multisig-utils
```

## Usage

```js
import {
  needsMoreSignatures,
  getMultisigServerEndpoint,
  submitToMultisigServer
} from '@stellarguard/multisig-utils';

const moreSignatures = await needsMoreSignatures(transaction, server);

if (moreSignatures) {
  const multisigEndpoint = await getMultisigServerEndpoint(
    moreSignatures[0].account
  );

  const result = await submitToMultisigServer(transaction, multisigEndpoint);

  if (result.stellarGuard) {
    console.log(`Authorize your transaction at ${result.url}`);
  }
}
```

## Examples

See [src/example.ts](https://github.com/stellarguard/multisig-utils/blob/master/src/example.ts) for examples.

Try a [live demo](https://stellarguard.github.io/multisig-utils/demo).

## Limitations

1. needsMoreSignatures currently only works with public key signers.
2. needsMoreSignatures does not correctly identify that an account needs more signatures if the transaction changes something (like adds more signers, creates new accounts and then uses them, changes thresholds) that would then require more signers for a later operation in the transaction.
