export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Lemons</h1>
          <p className="mt-2 text-muted-foreground">Household management, simplified</p>
        </div>
        {children}
      </div>
    </div>
  )
}
