# Third-party licenses

This project bundles data and/or code from the following third parties.

## EnOcean Equipment Profiles database (`data/eep.json`)

`data/eep.json` is a copy of the machine-readable EnOcean Equipment Profiles (EEP)
specification from the **enocean-js/eep-spec** project, used to decode EnOcean telegram
payloads into named fields.

- Source: https://github.com/enocean-js/eep-spec (`eep.json`)
- License: MIT

```
The MIT License (MIT)

Copyright (c) 2017 node-enocean
Copyright (c) 2017 Marc Cremers <marc.cremers@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The EEP specification itself is published by the EnOcean Alliance
(https://www.enocean-alliance.org/eep/); `eep.json` is an independent community
re-encoding of that specification.
