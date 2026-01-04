import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Settings } from 'lucide-react';

interface TeacherSettingsProps {
    userEmail?: string;
}

export const TeacherSettings = ({ userEmail }: TeacherSettingsProps) => {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Account Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label>Email</Label>
                        <div className="p-3 bg-muted rounded-lg text-sm">{userEmail}</div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Teacher settings are currently managed by the organization administrator.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
};
