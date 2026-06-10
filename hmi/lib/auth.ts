import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { upsertUser } from '@/lib/db/queries'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      googleId: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        await upsertUser({
          googleId: account.providerAccountId,
          email: user.email,
          name: user.name ?? user.email,
          picture: user.image,
        })
      }
      return true
    },
    async jwt({ token, account }) {
      if (account?.provider === 'google') {
        token.googleId = account.providerAccountId
      }
      return token
    },
    async session({ session, token }) {
      if (token.googleId) {
        session.user.googleId = token.googleId as string
        session.user.id = token.sub ?? ''
      }
      return session
    },
  },
})
