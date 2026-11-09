'use strict';

/**
 * Migration idempotente pour supprimer les doublons dans la table
 * `email_auth_challenges` tout en conservant la ligne la plus récente
 * (la plus grande `id`).
 *
 * Remarques :
 * - Cette opération est destructive (suppression de lignes en double).
 * - Avant d'exécuter la migration en production, faire une sauvegarde de la base
 *   (mysqldump) et vérifier le résultat en local.
 * - Le `down` est volontairement une no-op car la suppression n'est pas
 *   réversible automatiquement.
 */

module.exports = {
  up: async ({ queryInterface }) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Supprime toutes les lignes qui ont un id plus petit pour un couple
      // (email, purpose), donc on garde la ligne avec l'id le plus élevé
      // (typiquement la plus récente).
      const deleteDuplicatesSql = `
        DELETE e1 FROM email_auth_challenges e1
        INNER JOIN email_auth_challenges e2
          ON e1.email = e2.email
          AND e1.purpose = e2.purpose
          AND e1.id < e2.id;
      `;

      await queryInterface.sequelize.query(deleteDuplicatesSql, { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  down: async () => {
    // Non réversible automatiquement — laisser vide pour sécurité.
    return Promise.resolve();
  }
};
