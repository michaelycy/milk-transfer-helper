import { Button, Form, InputNumber, Input } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { PlanDaySpec } from '@milk-transfer/shared';

/** 逐日节奏行编辑器（FR-J4/C2：ratio 0–1 + 展示文案，最少 1 行） */
export function DaysEditor() {
  return (
    <>
      <Form.List
        name="days"
        rules={[
          {
            validator: async (_, value: PlanDaySpec[] | undefined) => {
              if (!value || value.length === 0) throw new Error('至少一行逐日节奏');
            },
          },
        ]}
      >
        {(fields, { add, remove }) => (
          <>
            {fields.map((field, index) => (
              <div key={field.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input size="small" value={`第 ${index + 1} 天`} disabled style={{ width: 72 }} />
                <Form.Item
                  name={[field.name, 'ratio']}
                  noStyle
                  rules={[
                    { required: true, message: '必填' },
                    {
                      type: 'number',
                      min: 0,
                      max: 1,
                      message: '0–1',
                    },
                  ]}
                >
                  <InputNumber
                    size="small"
                    min={0}
                    max={1}
                    step={0.01}
                    style={{ width: 110 }}
                    placeholder="新奶占比"
                  />
                </Form.Item>
                <Form.Item
                  name={[field.name, 'label']}
                  noStyle
                  rules={[{ required: true, message: '必填' }]}
                >
                  <Input size="small" style={{ flex: 1 }} placeholder="展示文案，如 新奶 1/3" />
                </Form.Item>
                <Button
                  size="small"
                  type="text"
                  danger
                  disabled={fields.length <= 1}
                  icon={<DeleteOutlined />}
                  onClick={() => remove(field.name)}
                />
              </div>
            ))}
            <Button
              size="small"
              type="dashed"
              block
              icon={<PlusOutlined />}
              onClick={() => add({ ratio: undefined, label: undefined } as unknown as PlanDaySpec)}
            >
              添加一天
            </Button>
          </>
        )}
      </Form.List>
    </>
  );
}
