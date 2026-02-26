import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const email = 'pugthetruth@gmail.com';

    try {
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            console.log(`User with email ${email} not found.`);
            return;
        }

        console.log(`Found user: ${user.id}. Deleting...`);

        // The user relation has onDelete.Cascade for most things.
        // However, Organization is NoAction. We are just deleting the User.
        // Let Prisma handle the cascades for everything else.
        await prisma.user.delete({
            where: { email },
        });

        console.log(`Successfully deleted user ${email}`);
    } catch (error) {
        console.error(`Failed to delete user:`, error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
