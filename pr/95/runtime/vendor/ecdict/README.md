# ECDICT, abridged

An English-Chinese dictionary in StarDict format, made by `tools/gen-ecdict.mjs` from `ecdict.csv` of
ECDICT by skywind3000 (Linwei), https://github.com/skywind3000/ECDICT, MIT License (`LICENSE`).

- `ecdict.ifo`, `ecdict.idx`, `ecdict.dict.dz`: the most common words by BNC / COCA rank, with their Chinese
  and English senses. Phonetics, Collins stars, Oxford 3000 and exam tags are left out, and so are the
  Chinese lines marked `[网络]` (web translations). The English senses come largely from WordNet
  (Princeton, `LICENSE-WordNet`), some from Webster's Revised Unabridged Dictionary (1913, public domain).
- `ecdict.lemma.gz`: gzipped `form<TAB>lemma` lines from ECDICT's exchange field (running -> run).

The review of where each field comes from is in LICENSING.md.
