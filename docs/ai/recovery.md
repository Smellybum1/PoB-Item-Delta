# Build Recovery

This app is local-only. Save and restore actions work with PoB build XML files on disk.

## In-App Restore

1. Open the app and make sure the current saved PoB build is detected.
2. In **Build Backups**, click **Refresh backups**.
3. Pick a backup for the current build and click **Restore**.
4. Confirm the restore prompt.
5. The app writes the selected backup over the current build and first creates a fresh pre-restore backup beside the original.

## Manual Restore

Use this only if the app cannot open or cannot restore.

1. Close Path of Building or make sure the affected build is not being edited.
2. Find the current build file. The app shows this as the original/source path; PoB2 build files are usually under a local `Path of Building (PoE2)\Builds` folder.
3. Find a sibling backup with this pattern:

   ```text
   Build Name.backup-YYYYMMDDHHMMSS.xml
   ```

4. Copy the current build file somewhere safe.
5. Copy the chosen backup file over the current build file.
6. Reopen PoB or refresh the build inside PoB.

## Notes

- Backups are created beside the original build before **Save over original** and before **Restore**.
- Backup restore is build-specific: only backups matching the current build file name are listed by the app.
- Save as new build does not overwrite the original and does not need restore.
- Do not edit PoB `Settings.xml` for recovery unless you are deliberately changing which build PoB opens.
