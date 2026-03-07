import { useAppContext } from "@/components/providers/marketplace";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CopyText = ({ text }: { text: string | undefined }) => {
    return (
        <div className="flex items-center gap-2">
            <input
                value={text}
                readOnly
                className="flex-1 px-3 py-2 border rounded-md"
            />
        </div>
    )
}

const AppContext = () => {
    const appContext = useAppContext();
    return (
        <>
            {appContext && (
                <>
                    <div>
                        <h2 className="mb-4 text-2xl font-bold">application.context</h2>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Property</TableHead>
                                <TableHead>Value</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>{appContext.name}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>ID</TableCell>
                                <TableCell>
                                    <CopyText text={appContext.id} />
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>Marketplace App Tenant ID</TableCell>
                                <TableCell>
                                    <CopyText text={appContext['marketplaceAppTenantId']} />
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>Organization ID</TableCell>
                                <TableCell>
                                    <CopyText text={appContext.organizationId} />
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>Icon</TableCell>
                                <TableCell>
                                    <img src={appContext.iconUrl} alt="App Icon" className="h-4 w-4" />
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>Installation ID</TableCell>
                                <TableCell>
                                    <CopyText text={appContext.installationId} />
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>State</TableCell>
                                <TableCell>{appContext.state}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>Type</TableCell>
                                <TableCell>{appContext.type}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </>
            )}
        </>
    );
}

export default AppContext;
