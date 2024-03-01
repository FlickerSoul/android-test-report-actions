# Android Test Report

This is an GitHub Action that reports Android testing results to [Summary](https://github.blog/2022-05-09-supercharging-github-actions-with-job-summaries/) 

## Usage

```yaml
- name: Report
  uses: FlickerSoul/android-test-report-actions@v1.2
  with:
    working-directory: "./test_data"  # Optional, default to "." (current repo directory)
    show-skipped: "true"  # Optional, default to "false"
    report-header-postfix: "(OS: ${{ matrix.os }})"  # Optional, defaulted to ""
```

## The Report

You would see a result pop up in the Summary for each Action run. Check out the Actions in this repo for detailed report. A screenshot is attached below (which might not be update to date).

![report image](./images/report.jpg)
