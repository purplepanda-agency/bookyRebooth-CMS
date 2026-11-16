-- AlterTable
ALTER TABLE `ContentBlock` ADD COLUMN `buttons` JSON NULL;

UPDATE `ContentBlock`
SET `buttons` = CASE
  WHEN `buttonLabel` IS NOT NULL AND `buttonLabel` <> '' AND `buttonUrl` IS NOT NULL AND `buttonUrl` <> ''
    THEN JSON_ARRAY(JSON_OBJECT('label', `buttonLabel`, 'url', `buttonUrl`))
  ELSE JSON_ARRAY()
END;

ALTER TABLE `ContentBlock` MODIFY `buttons` JSON NOT NULL;

ALTER TABLE `ContentBlock` DROP COLUMN `buttonLabel`,
    DROP COLUMN `buttonUrl`;
