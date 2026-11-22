# SHA repoint — account-registration-login

## Entry 2026-11-22

- **Date:** 2026-11-22
- **Target:** remote `origin` (github.com/dawidwoz/demokratia-pl-quiz), branch `main` @ `5c4bcfd2fb12f931539437c28817401ac6f794b5`
- **Integration commit:** `5c4bcfd` "S-03: Account registration and login (#11)" (full OID `5c4bcfd2fb12f931539437c28817401ac6f794b5`)
- **PR:** https://github.com/dawidwoz/demokratia-pl-quiz/pull/11 (state MERGED, base `main`, merge commit `5c4bcfd`, squash)
- **Evidence / change scope:** the PR commit list contains `a85821b`, `5f77d21`, `84a382d` and `356f716` (the commits recorded in Progress) plus three later commits not recorded in Progress (`99104ea` deploy smoke-check retry, `6d72256` mail-setting names in logs, `109c3f4` plan close-out). `git diff 109c3f4 5c4bcfd` is empty: the squash commit's file tree equals the PR tip tree (87 files, +9321/-87). `git merge-base --is-ancestor 5c4bcfd origin/main` exited 0.
- **Why repoint:** the PR was squash-merged, so the four phase commits are not in `main`'s history and the old suffixes would not resolve there. They stay reachable on the pushed branch `origin/feat/account-registration-login`.
- **User decision:** explicit "Update and archive" on 2026-11-22.
- **Rows repointed:** 30

| Row ID | Old suffix (resolved OID) | New SHA |
| --- | --- | --- |
| 1.1 | `a85821b` (`a85821ba888e9bfe4ca5e024f667b87e85631089`) | `5c4bcfd` |
| 1.2 | `a85821b` (`a85821ba888e9bfe4ca5e024f667b87e85631089`) | `5c4bcfd` |
| 1.3 | `a85821b` (`a85821ba888e9bfe4ca5e024f667b87e85631089`) | `5c4bcfd` |
| 1.4 | `a85821b` (`a85821ba888e9bfe4ca5e024f667b87e85631089`) | `5c4bcfd` |
| 1.5 | `a85821b` (`a85821ba888e9bfe4ca5e024f667b87e85631089`) | `5c4bcfd` |
| 1.6 | `a85821b` (`a85821ba888e9bfe4ca5e024f667b87e85631089`) | `5c4bcfd` |
| 2.1 | `5f77d21` (`5f77d2101899aed50eb7816f4fa134e2ca2e47ad`) | `5c4bcfd` |
| 2.2 | `5f77d21` (`5f77d2101899aed50eb7816f4fa134e2ca2e47ad`) | `5c4bcfd` |
| 2.3 | `5f77d21` (`5f77d2101899aed50eb7816f4fa134e2ca2e47ad`) | `5c4bcfd` |
| 2.4 | `5f77d21` (`5f77d2101899aed50eb7816f4fa134e2ca2e47ad`) | `5c4bcfd` |
| 2.5 | `5f77d21` (`5f77d2101899aed50eb7816f4fa134e2ca2e47ad`) | `5c4bcfd` |
| 2.6 | `5f77d21` (`5f77d2101899aed50eb7816f4fa134e2ca2e47ad`) | `5c4bcfd` |
| 2.7 | `5f77d21` (`5f77d2101899aed50eb7816f4fa134e2ca2e47ad`) | `5c4bcfd` |
| 3.1 | `84a382d` (`84a382d7b7702243ee53d354bf217c36a6d876ef`) | `5c4bcfd` |
| 3.2 | `84a382d` (`84a382d7b7702243ee53d354bf217c36a6d876ef`) | `5c4bcfd` |
| 3.3 | `84a382d` (`84a382d7b7702243ee53d354bf217c36a6d876ef`) | `5c4bcfd` |
| 3.4 | `84a382d` (`84a382d7b7702243ee53d354bf217c36a6d876ef`) | `5c4bcfd` |
| 3.5 | `84a382d` (`84a382d7b7702243ee53d354bf217c36a6d876ef`) | `5c4bcfd` |
| 3.6 | `84a382d` (`84a382d7b7702243ee53d354bf217c36a6d876ef`) | `5c4bcfd` |
| 3.7 | `84a382d` (`84a382d7b7702243ee53d354bf217c36a6d876ef`) | `5c4bcfd` |
| 4.1 | `356f716` (`356f71680ced986c10964d4a3fc3513f2533e2ca`) | `5c4bcfd` |
| 4.2 | `356f716` (`356f71680ced986c10964d4a3fc3513f2533e2ca`) | `5c4bcfd` |
| 4.3 | `356f716` (`356f71680ced986c10964d4a3fc3513f2533e2ca`) | `5c4bcfd` |
| 4.4 | `356f716` (`356f71680ced986c10964d4a3fc3513f2533e2ca`) | `5c4bcfd` |
| 4.5 | `356f716` (`356f71680ced986c10964d4a3fc3513f2533e2ca`) | `5c4bcfd` |
| 4.6 | `356f716` (`356f71680ced986c10964d4a3fc3513f2533e2ca`) | `5c4bcfd` |
| 4.7 | `356f716` (`356f71680ced986c10964d4a3fc3513f2533e2ca`) | `5c4bcfd` |
| 4.8 | `356f716` (`356f71680ced986c10964d4a3fc3513f2533e2ca`) | `5c4bcfd` |
| 4.9 | `356f716` (`356f71680ced986c10964d4a3fc3513f2533e2ca`) | `5c4bcfd` |
| 4.10 | `356f716` (`356f71680ced986c10964d4a3fc3513f2533e2ca`) | `5c4bcfd` |
