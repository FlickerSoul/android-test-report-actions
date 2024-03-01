# Android Test Report

This is an GitHub Action that reports Android testing results to [Summary](https://github.blog/2022-05-09-supercharging-github-actions-with-job-summaries/) 

## Usage

```yaml
- name: Report
  uses: FlickerSoul/android-test-report-actions
  with:
    working-directory: "./test_data"  # default to . (current repo direction)
```
