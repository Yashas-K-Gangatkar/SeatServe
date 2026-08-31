#!/usr/bin/env python3
"""Wrap converted page fragments into route page.tsx files."""
import os

BASE = '/home/z/my-project/src/app'
FRAG = '/home/z/my-project/scripts/notifetch-inspect/converted'

PAGES = [
    # (fragment, route dir, component name, wide, legal, docstring)
    ('developers.frag', 'developers', 'DevelopersPage', True, False,
     '/developers — architecture & stack notes (static article).'),
    ('privacy.frag', 'legal/privacy', 'PrivacyPage', False, True,
     '/legal/privacy — privacy policy (static article, live-faithful).'),
    ('terms.frag', 'legal/terms', 'TermsPage', False, True,
     '/legal/terms — terms of use (static article, live-faithful).'),
    ('refund.frag', 'legal/refund', 'RefundPolicyPage', False, True,
     '/legal/refund — cancellation & refund policy (static article).'),
]

TPL = '''{docstring}
import {{ AuxPage }} from '@/components/landing/AuxChrome'

export default function {component}() {{
  return (
    <AuxPage wide={wide_prop} legal={legal_prop}>
      <>
{fragment}
      </>
    </AuxPage>
  )
}}
'''

for frag_name, route, component, wide, legal, doc in PAGES:
    frag = open(os.path.join(FRAG, frag_name)).read().strip()
    # indent fragment by 6 spaces, wrap in a JSX fragment (multiple roots)
    frag_indented = '\n'.join('      ' + line for line in frag.split('\n'))
    out = TPL.format(
        docstring=f"// {doc}",
        component=component,
        wide_prop='{true}' if wide else '{false}',
        legal_prop='{true}' if legal else '{false}',
        fragment=frag_indented,
    )
    path = os.path.join(BASE, route, 'page.tsx')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(out)
    print(f"wrote {path} ({len(out)} bytes)")
