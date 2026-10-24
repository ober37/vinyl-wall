// discogsMatch values the background task's matcher writes (app/tools/discogs_sync.py): a release matched for you,
// not one you chose. dev/test_discogs.py checks this list covers every value the matcher writes.
// prettier-ignore
export const AUTO_MATCH = ["master main release", "vinyl: master main release", "vinyl: earliest original pressing", "vinyl: first matching release", "catalog", "catalog+pressing"]
